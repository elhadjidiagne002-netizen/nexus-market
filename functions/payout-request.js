/**
 * functions/payout-request.js
 * POST /payout-request → Crée une demande de retrait vendeur via PayTech Transfer
 */
import { createClient } from "@supabase/supabase-js";

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
    PAYTECH_API_KEY, PAYTECH_API_SECRET,
    PAYTECH_ENV = "prod",
    SITE_URL,
  } = env;

  if (!SUPABASE_SERVICE_KEY || !PAYTECH_API_KEY || !PAYTECH_API_SECRET) {
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

  if (!amount || amount < MIN_PAYOUT_XOF) {
    return json(400, { error: `Montant minimum ${MIN_PAYOUT_XOF} FCFA` });
  }
  if (!method || !["mobile","bank"].includes(method)) {
    return json(400, { error: "Méthode invalide" });
  }
  if (method === "mobile" && !PROVIDERS[provider]) {
    return json(400, { error: "Opérateur invalide (orange, wave, free)" });
  }
  if (!destination || destination.trim().length < 3) {
    return json(400, { error: "Destination obligatoire" });
  }

  const commissionRate = parseFloat(env.NEXUS_COMMISSION || "0.15");
  const eurToXof = parseFloat(env.EUR_TO_XOF || "655.957");

  // Calcul du solde
  const { data: orders } = await sb
    .from("orders")
    .select("total, commission")
    .eq("vendor", user.id)
    .eq("status", "delivered");

  const grossXof = orders.reduce((s, o) => s + Math.round((o.total || 0) * eurToXof), 0);
  const commXof = orders.reduce((s, o) => {
    const c = o.commission != null ? o.commission : (o.total || 0) * commissionRate;
    return s + Math.round(c * eurToXof);
  }, 0);
  const netXof = grossXof - commXof;

  const { data: existing } = await sb
    .from("payout_requests")
    .select("amount_xof, status")
    .eq("vendor_id", user.id)
    .in("status", ["pending", "processing", "paid"]);

  const usedXof = existing.reduce((s, p) => s + p.amount_xof, 0);
  const availableXof = Math.max(0, netXof - usedXof);

  if (amount > availableXof) {
    return json(400, { error: `Solde insuffisant (disponible ${availableXof} FCFA)` });
  }

  // Profil vendeur
  const { data: profile } = await sb
    .from("users")
    .select("name, email")
    .eq("id", user.id)
    .single();

  const vendorName = profile?.name || user.email || "Vendeur";
  const vendorEmail = profile?.email || user.email;

  // Création en base
  const refCommand = `NEXUS-PAY-${Date.now()}`;
  const { data: newPayout, error: insertErr } = await sb
    .from("payout_requests")
    .insert({
      vendor_id: user.id,
      vendor_name: vendorName,
      vendor_email: vendorEmail,
      amount_xof: amount,
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

  // Appel PayTech Transfer
  const ptPayload = {
    item_name: `Retrait NEXUS - ${vendorName}`,
    item_price: amount,
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
    const { ok, data } = await callPaytechTransfer(ptPayload, PAYTECH_API_KEY, PAYTECH_API_SECRET);
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

  // Notification admin
  await sb.from("notifications").insert({
    user_id: "admin",
    type: "payout",
    title: "💰 Nouvelle demande de retrait",
    message: `${vendorName} demande ${amount.toLocaleString("fr-FR")} FCFA via ${method === "mobile" ? PROVIDERS[provider] : "virement"}`,
    read: false,
  }).catch(e => console.warn("[payout-request] notif error:", e.message));

  return json(201, {
    ok: true,
    payout_id: newPayout.id,
    ref_command: refCommand,
    status: paytechOk ? "processing" : "pending",
    amount_xof: amount,
    available_xof: availableXof - amount,
  });
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: cors() });
}
