/**
 * Netlify Function — PayTech Mobile Money
 * POST /api/payments/mobile-money  (via redirect dans netlify.toml)
 * ou directement : POST /.netlify/functions/payments-mobile-money
 *
 * Variables d'environnement requises (Netlify Dashboard → Environment variables) :
 *   PAYTECH_API_KEY    — clé API PayTech
 *   PAYTECH_SECRET_KEY — clé secrète PayTech
 *   PAYTECH_ENV        — "prod" (encaissements réels) | "test" (sandbox)
 *   FRONTEND_URL       — https://nexus-market-md360.netlify.app
 *
 * Body attendu : { orderId: string, amount: number }  ← amount en EUR
 * Réponse OK  : { redirect_url: string, token: string, amountFcfa: number }
 * Réponse KO  : { error: string }
 */

const crypto = require("crypto");

const EUR_TO_FCFA = 655.957;

exports.handler = async (event) => {
  // ── CORS pre-flight ──────────────────────────────────────────────────────
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: corsHeaders(), body: "" };
  }
  if (event.httpMethod !== "POST") {
    return json(405, { error: "Méthode non autorisée" });
  }

  // ── Lire les clés depuis les variables d'environnement ──────────────────
  const PAYTECH_API_KEY    = process.env.PAYTECH_API_KEY;
  const PAYTECH_SECRET_KEY = process.env.PAYTECH_SECRET_KEY;
  const PAYTECH_ENV        = process.env.PAYTECH_ENV || "prod";
  const FRONTEND_URL       = process.env.FRONTEND_URL || `https://${event.headers["host"]}`;

  if (!PAYTECH_API_KEY || !PAYTECH_SECRET_KEY) {
    console.error("[PayTech] PAYTECH_API_KEY ou PAYTECH_SECRET_KEY manquant dans les variables d'environnement");
    return json(500, { error: "Configuration serveur incomplète — contacter l'administrateur" });
  }

  // ── Parser le body ───────────────────────────────────────────────────────
  let body;
  try { body = JSON.parse(event.body || "{}"); }
  catch { return json(400, { error: "Corps JSON invalide" }); }

  const { orderId, amount } = body;
  if (!orderId || amount == null || isNaN(Number(amount))) {
    return json(400, { error: "orderId et amount (EUR) sont requis" });
  }

  // ── Conversion EUR → FCFA ────────────────────────────────────────────────
  const amountFcfa = Math.round(Number(amount) * EUR_TO_FCFA);
  if (amountFcfa < 100) {
    return json(400, { error: `Montant trop faible : ${amountFcfa} FCFA (minimum 100 FCFA)` });
  }

  // ── URLs de callback ─────────────────────────────────────────────────────
  const successUrl = `${FRONTEND_URL}/?payment=success&orderId=${encodeURIComponent(orderId)}`;
  const cancelUrl  = `${FRONTEND_URL}/?payment=cancel&orderId=${encodeURIComponent(orderId)}`;
  const ipnUrl     = `${FRONTEND_URL}/.netlify/functions/paytech-webhook`;

  // ── Appel API PayTech ────────────────────────────────────────────────────
  const payload = {
    item_name:    `Commande NEXUS Market #${orderId}`,
    item_price:   amountFcfa,
    currency:     "XOF",
    ref_command:  orderId,
    command_name: "Paiement Mobile Money — NEXUS Market",
    env:          PAYTECH_ENV,
    ipn_url:      ipnUrl,
    success_url:  successUrl,
    cancel_url:   cancelUrl,
    custom_field: JSON.stringify({ orderId, source: "nexus-market" }),
  };

  let ptResponse;
  try {
    ptResponse = await fetch("https://paytech.sn/api/payment/request-payment", {
      method:  "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept":        "application/json",
        "API_KEY":       PAYTECH_API_KEY,
        "API_SECRET":    PAYTECH_SECRET_KEY,
      },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    console.error("[PayTech] Erreur réseau:", err.message);
    return json(502, { error: "Impossible de joindre PayTech — vérifiez votre connexion" });
  }

  let ptData;
  try { ptData = await ptResponse.json(); }
  catch {
    console.error("[PayTech] Réponse non-JSON, status:", ptResponse.status);
    return json(502, { error: "Réponse invalide de PayTech" });
  }

  if (!ptResponse.ok || ptData.success !== 1) {
    const errors = Array.isArray(ptData.errors)
      ? ptData.errors.join(", ")
      : JSON.stringify(ptData);
    console.error("[PayTech] Échec:", errors);
    return json(400, { error: `PayTech a refusé le paiement : ${errors}` });
  }

  console.log(`[PayTech] ✅ Initialisé — orderId=${orderId} montant=${amountFcfa} FCFA token=${ptData.token}`);

  return json(200, {
    redirect_url: ptData.redirect_url,
    token:        ptData.token,
    orderId,
    amountFcfa,
  });
};

// ── Helpers ────────────────────────────────────────────────────────────────

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin":  "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}

function json(statusCode, body) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json", ...corsHeaders() },
    body: JSON.stringify(body),
  };
}
