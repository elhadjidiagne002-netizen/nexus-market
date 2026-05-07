/**
 * functions/payments-mobile-money.js
 * ──────────────────────────────────────────────────────────────────────────
 * POST /payments-mobile-money — Initie un paiement PayTech Mobile Money
 *
 * Adaptation Netlify → Cloudflare :
 *   • Le module `crypto` n'était pas utilisé dans le handler → supprimé.
 *   • fetch est déjà natif dans Cloudflare Workers (pas de polyfill nécessaire).
 *   • process.env → env
 *   • Body lu via request.json()
 *
 * Variables d'environnement Cloudflare :
 *   PAYTECH_API_KEY    — Clé API PayTech
 *   PAYTECH_SECRET_KEY — Secret PayTech
 *   PAYTECH_ENV        — "prod" | "test"
 *   FRONTEND_URL       — URL publique du site (pour les callbacks)
 */

const EUR_TO_FCFA = 655.957;

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin":  "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders() },
  });
}

export async function onRequestPost(context) {
  const { request, env } = context;

  const {
    PAYTECH_API_KEY,
    PAYTECH_SECRET_KEY,
    PAYTECH_ENV  = "prod",
    FRONTEND_URL,
  } = env;

  // Fallback : utiliser l'hôte de la requête si FRONTEND_URL non défini
  const host     = request.headers.get("host") || "";
  const protocol = host.includes("localhost") ? "http" : "https";
  const baseUrl  = FRONTEND_URL || `${protocol}://${host}`;

  if (!PAYTECH_API_KEY || !PAYTECH_SECRET_KEY) {
    console.error("[PayTech] Clés API manquantes");
    return json(500, { error: "Configuration serveur incomplète — contacter l'administrateur" });
  }

  // ── Parser le body ────────────────────────────────────────────────────────
  let body;
  try { body = await request.json(); }
  catch { return json(400, { error: "Corps JSON invalide" }); }

  const { orderId, amount } = body;

  if (!orderId || amount == null || isNaN(Number(amount))) {
    return json(400, { error: "orderId et amount (EUR) sont requis" });
  }

  // ── Conversion EUR → FCFA ─────────────────────────────────────────────────
  const amountFcfa = Math.round(Number(amount) * EUR_TO_FCFA);
  if (amountFcfa < 100) {
    return json(400, { error: `Montant trop faible : ${amountFcfa} FCFA (minimum 100 FCFA)` });
  }

  // ── URLs de callback ──────────────────────────────────────────────────────
  const successUrl = `${baseUrl}/?payment=success&orderId=${encodeURIComponent(orderId)}`;
  const cancelUrl  = `${baseUrl}/?payment=cancel&orderId=${encodeURIComponent(orderId)}`;
  const ipnUrl     = `${baseUrl}/functions/paytech-webhook`;

  // ── Appel API PayTech ─────────────────────────────────────────────────────
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
        "Accept":       "application/json",
        "API_KEY":      PAYTECH_API_KEY,
        "API_SECRET":   PAYTECH_SECRET_KEY,
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

  console.log(`[PayTech] ✅ orderId=${orderId} montant=${amountFcfa} FCFA token=${ptData.token}`);

  return json(200, {
    redirect_url: ptData.redirect_url,
    token:        ptData.token,
    orderId,
    amountFcfa,
  });
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: corsHeaders() });
}
