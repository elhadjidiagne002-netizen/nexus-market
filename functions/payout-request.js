/**
 * functions/payout-request.js
 * POST /payout-request → Crée une demande de retrait vendeur via PayTech Transfer
 */
import { createClient } from "@supabase/supabase-js";
import { sendEventEmail } from "./api/_lib/notify.js";

const MIN_PAYOUT_XOF = 1000;

const PROVIDERS = {
  orange: "Orange Money",
  wave: "Wave",
  free: "Free Money",
};

function cors() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...cors() },
  });
}

async function callPaytechTransfer(payload, apiKey, apiSecret) {
  const res = await fetch("https://paytech.sn/api/payment/request-payment", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "API_KEY": apiKey,
      "API_SECRET": apiSecret,
    },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(async () => ({ raw: await res.text() }));
  return { ok: res.ok, status: res.status, data };
}

export async function onRequestPost(context) {
  const { request, env } = context;

  const {
    SUPABASE_URL, SUPABASE_SERVICE_KEY,
    PAYTECH_API_KEY,
    // [FIX] Harmonisation : PAYTECH_SECRET_KEY (était PAYTECH_API_SECRET
    // dans cette fonction, mais PAYTECH_SECRET_KEY partout ailleurs).
    PAYTECH_SECRET_KEY,
    PAYTECH_ENV = "prod",
    SITE_URL,
  } = env;

  if (!SUPABASE_SERVICE_KEY || !PAYTECH_API_KEY || !PAYTECH_SECRET_KEY) {
    return json(503, { error: "Configuration incomplète" });
  }

  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Auth
  const auth = request.headers.get("Authorization") || "";
  if (!auth.startsWith("Bearer ")) return json(401, { error: "Token manquant" });
  const { data: { user }, error: authErr } = await sb.auth.getUser(auth.slice(7));
  if (authErr || !user) return json(401, { error: "Token invalide" });

  // Body
  let body;
  try { body = await request.json(); } catch { return json(400, { error: "JSON invalide" }); }
  const { amount, method, provider, destination } = body;

  // [FIX] Validation que amount est un entier positif (PayTech exige un entier XOF)
  const amountInt = Math.floor(Number(amount));
  if (!amountInt || amountInt < MIN_PAYOUT_XOF || amountInt !== Number(amount)) {
    return json(400, { error: `Montant invalide — entier ≥ ${MIN_PAYOUT_XOF} FCFA requis` });
  }
  if (!method || !["mobile", "bank"].includes(method)) {
    return json(400, { error: "Méthode invalide" });
  }
  if (method === "mobile" && !PROVIDERS[provider]) {
    return json(400, { error: "Opérateur invalide (orange, wave, free)" });
  }
  if (!destination || destination.trim().length < 3) {
    return json(400, { error: "Destination obligatoire" });
  }

  // [COMMISSION] Défaut 0 % (phase de lancement RT-01/PM-01) ; piloté par NEXUS_COMMISSION.
  const commissionRate = parseFloat(env.NEXUS_COMMISSION || "0");
  const eurToXof = parseFloat(env.EUR_TO_XOF || "655.957");

  // Calcul du solde
  // [FIX] La colonne du vendeur est vendor_id (et non vendor)
  // conformément au schéma orders (cf. saveOrder dans index.html).
  // [#13 ESCROW] Option : ne compter dans le solde retirable que les commandes
  // livrées AVEC preuve de livraison (photo). Inactif par défaut → aucun
  // changement de comportement tant que REQUIRE_DELIVERY_PHOTO !== "true".
  const requireProof = String(env.REQUIRE_DELIVERY_PHOTO || "") === "true";
  let ordersQuery = sb
    .from("orders")
    .select("total, commission, delivery_photo_url")
    .eq("vendor_id", user.id)
    .eq("status", "delivered");
  if (requireProof) ordersQuery = ordersQuery.not("delivery_photo_url", "is", null);
  const { data: orders, error: ordErr } = await ordersQuery;

  if (ordErr) return json(500, { error: "Erreur lecture commandes" });

  const grossXof = (orders || []).reduce((s, o) => s + Math.round((o.total || 0) * eurToXof), 0);
  const commXof = (orders || []).reduce((s, o) => {
    const c = o.commission != null ? o.commission : (o.total || 0) * commissionRate;
    return s + Math.round(c * eurToXof);
  }, 0);
  const netXof = grossXof - commXof;

  // [FIX] Vérification de l'erreur avant le .reduce() — si la query échoue,
  // existing vaut null et .reduce() lèverait un TypeError.
  const { data: existing, error: existErr } = await sb
    .from("payout_requests")
    .select("amount_xof, status")
    .eq("vendor_id", user.id)
    .in("status", ["pending", "processing", "paid"]);

  if (existErr) return json(500, { error: "Erreur lecture retraits" });

  const usedXof = (existing || []).reduce((s, p) => s + (p.amount_xof || 0), 0);
  const availableXof = Math.max(0, netXof - usedXof);

  if (amountInt > availableXof) {
    return json(400, { error: `Solde insuffisant (disponible ${availableXof} FCFA)` });
  }

  // [FIX] Table profiles (et non users) pour le profil vendeur
  const { data: profile } = await sb
    .from("profiles")
    .select("name, email")
    .eq("id", user.id)
    .single();

  const vendorName = profile?.name || user.email || "Vendeur";
  const vendorEmail = profile?.email || user.email;

  const refCommand = `NEXUS-PAY-${Date.now()}`;
  const { data: newPayout, error: insertErr } = await sb
    .from("payout_requests")
    .insert({
      vendor_id: user.id,
      vendor_name: vendorName,
      vendor_email: vendorEmail,
      amount_xof: amountInt,
      method,
      provider: method === "mobile" ? provider : "bank",
      destination: destination.trim(),
      status: "pending",
      ref_command: refCommand,
    })
    .select()
    .single();

  if (insertErr) {
    console.error("[payout-request] insert error:", insertErr.message);
    return json(500, { error: "Erreur création demande" });
  }

  const ptPayload = {
    item_name: `Retrait NEXUS - ${vendorName}`,
    item_price: amountInt,
    currency: "XOF",
    ref_command: refCommand,
    command_name: method === "mobile" ? PROVIDERS[provider] : "Virement bancaire",
    env: PAYTECH_ENV,
    ipn_url: `${SITE_URL || "https://nexus-market.pages.dev"}/functions/paytech-payout-webhook`,
    success_url: `${SITE_URL}/?payout=success`,
    cancel_url: `${SITE_URL}/?payout=cancel`,
    custom_field: JSON.stringify({ payout_id: newPayout.id, vendor_id: user.id }),
  };

  let paytechOk = false;
  try {
    const { ok, data } = await callPaytechTransfer(ptPayload, PAYTECH_API_KEY, PAYTECH_SECRET_KEY);
    if (ok && data.success === 1) {
      paytechOk = true;
      await sb.from("payout_requests")
        .update({ status: "processing", paytech_token: data.token, paytech_ref: data.ref_command || refCommand })
        .eq("id", newPayout.id);
    } else {
      console.warn("[payout-request] PayTech transfer failed:", data);
    }
  } catch (e) {
    console.error("[payout-request] PayTech call error:", e.message);
  }

  // [FIX] notifications.user_id est une FK vers profiles.id (UUID). L'ancienne
  // valeur de repli "admin" violait la contrainte → insert en échec silencieux.
  // On n'insère la notification admin QUE si un UUID admin valide est configuré
  // (env.ADMIN_USER_ID) ; sinon on journalise et on s'appuie sur l'email admin.
  const adminId = (env.ADMIN_USER_ID || "").trim();
  const ADMIN_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (ADMIN_UUID_RE.test(adminId)) {
    await sb.from("notifications").insert({
      user_id: adminId,
      // type ∈ {order,offer,message,return,vendor,system,dispute} → 'system'
      type: "system",
      title: "💰 Nouvelle demande de retrait",
      message: `${vendorName} demande ${amountInt.toLocaleString("fr-FR")} FCFA via ${method === "mobile" ? PROVIDERS[provider] : "virement"}`,
      read: false,
    }).catch(e => console.warn("[payout-request] notif error:", e.message));
  } else {
    console.warn("[payout-request] ADMIN_USER_ID absent/invalide — notification admin ignorée (email envoyé à la place).");
  }

  // Emails (centre de notifications) : accusé au vendeur + alerte à l'admin.
  const _amtFcfa = amountInt.toLocaleString("fr-FR");
  if (vendorEmail) {
    await sendEventEmail(env, "payout_requested", vendorEmail, {
      vendor_name: vendorName, amount_fcfa: _amtFcfa, _userId: user.id,
    }).catch(e => console.warn("[payout-request] email vendeur:", e.message));
  }
  if (env.ADMIN_EMAIL) {
    await sendEventEmail(env, "admin_payout_request", env.ADMIN_EMAIL, {
      vendor_name: vendorName, amount_fcfa: _amtFcfa,
      method: method === "mobile" ? PROVIDERS[provider] : "virement bancaire",
    }).catch(e => console.warn("[payout-request] email admin:", e.message));
  }

  return json(201, {
    ok: true,
    payout_id: newPayout.id,
    ref_command: refCommand,
    status: paytechOk ? "processing" : "pending",
    amount_xof: amountInt,
    available_xof: availableXof - amountInt,
  });
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: cors() });
}
