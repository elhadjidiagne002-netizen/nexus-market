/**
 * functions/payout-request.js
 * ──────────────────────────────────────────────────────────────────────────
 * POST /payout-request → Crée une demande de retrait vendeur via PayTech Transfer
 *
 * Adaptation Netlify → Cloudflare :
 *   • Le module Node.js `https` est supprimé : Cloudflare Workers expose
 *     l'API `fetch` globalement (standard Web API).
 *   • process.env → env (objet injecté par Cloudflare).
 *   • exports.handler → export async function onRequestPost
 *
 * Variables d'environnement Cloudflare :
 *   SUPABASE_URL         — URL Supabase
 *   SUPABASE_SERVICE_KEY — Clé service_role
 *   PAYTECH_API_KEY      — Clé API PayTech
 *   PAYTECH_API_SECRET   — Secret API PayTech
 *   PAYTECH_ENV          — "prod" | "test"
 *   SITE_URL             — URL publique du site
 *   NEXUS_COMMISSION     — Commission (défaut 0.15)
 *   EUR_TO_XOF           — Taux de change (défaut 655.957)
 */

import { createClient } from "@supabase/supabase-js";

const MIN_PAYOUT_XOF = 1000;

const PROVIDER_MAP = {
  orange: "Orange Money",
  wave:   "Wave",
  free:   "Free Money",
};

function cors() {
  return {
    "Access-Control-Allow-Origin":  "*",
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

// ── Appel API PayTech (fetch natif Cloudflare) ────────────────────────────
async function paytechTransfer(payload, apiKey, apiSecret) {
  const res = await fetch("https://paytech.sn/api/payment/request-payment", {
    method:  "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept":       "application/json",
      "API_KEY":      apiKey,
      "API_SECRET":   apiSecret,
    },
    body: JSON.stringify(payload),
  });

  let data;
  try { data = await res.json(); }
  catch { data = await res.text(); }

  return { status: res.status, body: data };
}

// ── Handler principal ─────────────────────────────────────────────────────
export async function onRequestPost(context) {
  const { request, env } = context;

  // ── Vérification des variables d'env ─────────────────────────────────────
  const {
    SUPABASE_URL, SUPABASE_SERVICE_KEY,
    PAYTECH_API_KEY, PAYTECH_API_SECRET,
    PAYTECH_ENV = "prod",
    SITE_URL    = "https://nexus-market.pages.dev",
  } = env;

  if (!SUPABASE_SERVICE_KEY || !PAYTECH_API_KEY || !PAYTECH_API_SECRET) {
    console.error("[payout-request] Variables d'env manquantes");
    return json(503, { error: "Configuration serveur incomplète" });
  }

  const NEXUS_COMMISSION = parseFloat(env.NEXUS_COMMISSION || "0.15");
  const EUR_TO_XOF       = parseFloat(env.EUR_TO_XOF       || "655.957");

  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // ── Auth ──────────────────────────────────────────────────────────────────
  const authHeader = request.headers.get("authorization") || "";
  if (!authHeader.startsWith("Bearer ")) {
    return json(401, { error: "Token manquant" });
  }

  const { data: { user }, error: authErr } = await sb.auth.getUser(authHeader.slice(7));
  if (authErr || !user) {
    return json(401, { error: "Token invalide ou expiré" });
  }

  // ── Lecture du body ───────────────────────────────────────────────────────
  let payload;
  try { payload = await request.json(); }
  catch { return json(400, { error: "JSON invalide" }); }

  const { amount, method, provider, destination } = payload;

  // ── Validations ───────────────────────────────────────────────────────────
  if (!amount || typeof amount !== "number" || amount < MIN_PAYOUT_XOF) {
    return json(400, { error: `Montant minimum : ${MIN_PAYOUT_XOF.toLocaleString("fr-FR")} FCFA` });
  }
  if (!method || !["mobile", "bank"].includes(method)) {
    return json(400, { error: "Méthode invalide (mobile | bank)" });
  }
  if (method === "mobile" && !PROVIDER_MAP[provider]) {
    return json(400, { error: "Opérateur invalide (orange | wave | free)" });
  }
  if (!destination || destination.trim().length < 3) {
    return json(400, { error: "Destination (téléphone/IBAN) obligatoire" });
  }

  // ── Calcul du solde disponible ────────────────────────────────────────────
  const { data: orders, error: ordErr } = await sb
    .from("orders")
    .select("total, commission")
    .eq("vendor", user.id)
    .eq("status", "delivered");

  if (ordErr) {
    console.error("[payout-request] orders:", ordErr.message);
    return json(500, { error: "Impossible de calculer le solde" });
  }

  const grossXof = (orders || []).reduce((s, o) => s + Math.round((o.total || 0) * EUR_TO_XOF), 0);
  const commXof  = (orders || []).reduce((s, o) => {
    const c = o.commission != null ? o.commission : (o.total || 0) * NEXUS_COMMISSION;
    return s + Math.round(c * EUR_TO_XOF);
  }, 0);
  const netXof = grossXof - commXof;

  const { data: existingPayouts, error: payErr } = await sb
    .from("payout_requests")
    .select("amount_xof, status")
    .eq("vendor_id", user.id)
    .in("status", ["pending", "processing", "paid"]);

  if (payErr) {
    console.error("[payout-request] payouts:", payErr.message);
    return json(500, { error: "Impossible de vérifier les retraits existants" });
  }

  const usedXof      = (existingPayouts || []).reduce((s, p) => s + (p.amount_xof || 0), 0);
  const availableXof = Math.max(0, netXof - usedXof);

  if (amount > availableXof) {
    return json(400, {
      error:     `Solde insuffisant. Disponible : ${availableXof.toLocaleString("fr-FR")} FCFA`,
      available: availableXof,
    });
  }

  // ── Récupération du profil vendeur ────────────────────────────────────────
  const { data: profile } = await sb
    .from("users")
    .select("name, email")
    .eq("id", user.id)
    .single();

  const vendorName  = profile?.name  || user.email || "Vendeur";
  const vendorEmail = profile?.email || user.email;

  // ── Création de la demande en Supabase (statut initial : pending) ─────────
  const refCommand = `NEXUS-PAY-${Date.now()}`;

  const { data: newPayout, error: insertErr } = await sb
    .from("payout_requests")
    .insert({
      vendor_id:    user.id,
      vendor_name:  vendorName,
      vendor_email: vendorEmail,
      amount_xof:   amount,
      method,
      provider:     method === "mobile" ? provider : "bank",
      destination:  destination.trim(),
      status:       "pending",
      ref_command:  refCommand,
    })
    .select()
    .single();

  if (insertErr) {
    console.error("[payout-request] insert:", insertErr.message);
    return json(500, { error: "Impossible de créer la demande" });
  }

  // ── Appel PayTech Transfer ────────────────────────────────────────────────
  const paytechPayload = {
    item_name:    `Retrait vendeur NEXUS — ${vendorName}`,
    item_price:   amount,
    currency:     "XOF",
    ref_command:  refCommand,
    command_name: `Paiement ${method === "mobile" ? PROVIDER_MAP[provider] : "virement bancaire"}`,
    env:          PAYTECH_ENV,
    ipn_url:      `${SITE_URL}/functions/paytech-payout-webhook`,
    success_url:  `${SITE_URL}/?payout=success`,
    cancel_url:   `${SITE_URL}/?payout=cancel`,
    custom_field: JSON.stringify({
      payout_id: newPayout.id,
      vendor_id: user.id,
      ref:       refCommand,
    }),
    ...(method === "mobile" && {
      payment_method: `${provider}-money`,
      phone_number:   destination.replace(/\s/g, ""),
    }),
  };

  let paytechResult = null;
  let paytechError  = null;

  try {
    const ptRes = await paytechTransfer(paytechPayload, PAYTECH_API_KEY, PAYTECH_API_SECRET);
    console.log("[payout-request] PayTech response:", JSON.stringify(ptRes.body));

    if (ptRes.status === 200 && ptRes.body?.success === 1) {
      paytechResult = ptRes.body;
      await sb
        .from("payout_requests")
        .update({
          status:        "processing",
          paytech_token: ptRes.body.token || null,
          paytech_ref:   ptRes.body.ref_command || refCommand,
        })
        .eq("id", newPayout.id);
    } else {
      paytechError = ptRes.body?.error || "Réponse PayTech inattendue";
      console.warn("[payout-request] PayTech non-success:", ptRes.body);
    }
  } catch (e) {
    paytechError = e.message;
    console.error("[payout-request] PayTech call failed:", e.message);
  }

  // ── Notification admin ────────────────────────────────────────────────────
  await sb.from("notifications").insert({
    user_id: "admin",
    type:    "payout",
    title:   "💰 Demande de retrait",
    message: `${vendorName} demande ${amount.toLocaleString("fr-FR")} FCFA via ${method === "mobile" ? PROVIDER_MAP[provider] : "virement"}`,
    read:    false,
  }).catch(e => console.warn("[payout-request] notif:", e.message));

  return new Response(
    JSON.stringify({
      ok:          true,
      payout_id:   newPayout.id,
      ref_command: refCommand,
      status:      paytechResult ? "processing" : "pending",
      amount_xof:  amount,
      available:   availableXof - amount,
      paytech_ok:  !!paytechResult,
      ...(paytechError && { paytech_warning: paytechError }),
    }),
    {
      status:  201,
      headers: { "Content-Type": "application/json", ...cors() },
    }
  );
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: cors() });
}
