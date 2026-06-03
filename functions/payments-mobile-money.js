/**
 * functions/payments-mobile-money.js
 * Initie un paiement PayTech (Wave, Orange Money, etc.)
 */
import { rateLimit, clientIp, tooManyRequests } from "./api/_lib/ratelimit.js";

const EUR_TO_FCFA = 655.957;

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
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
    PAYTECH_ENV = "prod",
    FRONTEND_URL,
  } = env;
  // Accepte les deux conventions de nommage du secret présentes dans le projet.
  const PAYTECH_SECRET_KEY = env.PAYTECH_SECRET_KEY || env.PAYTECH_API_SECRET;

  // Fallback de l'URL du site
  const host = request.headers.get("host") || "";
  const protocol = host.includes("localhost") ? "http" : "https";
  const baseUrl = FRONTEND_URL || `${protocol}://${host}`;

  if (!PAYTECH_API_KEY || !PAYTECH_SECRET_KEY) {
    console.error("[Payments-Mobile] Clés API PayTech manquantes");
    return json(500, { error: "Configuration serveur incomplète" });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json(400, { error: "JSON invalide" });
  }

  const { orderId, amount } = body;
  if (!orderId || amount == null || isNaN(Number(amount))) {
    return json(400, { error: "orderId et amount (EUR) requis" });
  }
  // Validation renforcée : type/longueur de orderId + borne du montant.
  if (typeof orderId !== "string" || orderId.length > 64) {
    return json(400, { error: "orderId invalide" });
  }
  const amountNum = Number(amount);
  if (!Number.isFinite(amountNum) || amountNum <= 0 || amountNum > 100000) {
    return json(400, { error: "Montant invalide (0 < amount ≤ 100000 EUR)" });
  }

  const amountFcfa = Math.round(amountNum * EUR_TO_FCFA);
  if (amountFcfa < 100) {
    return json(400, { error: `Montant minimum 100 FCFA (reçu ${amountFcfa})` });
  }

  // ── Rate limiting : 10 tentatives de paiement / minute / IP ─────────────
  const rl = await rateLimit(env, `pay:${clientIp(request)}`, 10, 60);
  if (!rl.allowed) return tooManyRequests(rl.resetAt, corsHeaders());

  // URLs de callback
  const successUrl = `${baseUrl}/?payment=success&orderId=${encodeURIComponent(orderId)}`;
  const cancelUrl  = `${baseUrl}/?payment=cancel&orderId=${encodeURIComponent(orderId)}`;
  const ipnUrl     = `${baseUrl}/functions/paytech-webhook`;

  try {
    const ptRes = await fetch("https://paytech.sn/api/payment/request-payment", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "API_KEY": PAYTECH_API_KEY,
        "API_SECRET": PAYTECH_SECRET_KEY,
      },
      body: JSON.stringify({
        item_name: `Commande NEXUS #${orderId}`,
        item_price: amountFcfa,
        currency: "XOF",
        ref_command: orderId,
        command_name: "Paiement Mobile Money – NEXUS Market",
        env: PAYTECH_ENV,
        ipn_url: ipnUrl,
        success_url: successUrl,
        cancel_url: cancelUrl,
        custom_field: JSON.stringify({ orderId, source: "nexus-market" }),
      }),
    });

    const ptData = await ptRes.json();

    if (!ptRes.ok || ptData.success !== 1) {
      console.error("[Payments-Mobile] PayTech erreur:", ptData);
      return json(400, { error: "PayTech a refusé la demande" });
    }

    console.log(`[Payments-Mobile] Paiement initié token=${ptData.token} orderId=${orderId}`);
    return json(200, {
      redirect_url: ptData.redirect_url,
      token: ptData.token,
      orderId,
      amountFcfa,
    });
  } catch (err) {
    console.error("[Payments-Mobile] Erreur réseau:", err.message);
    return json(502, { error: "Impossible de contacter PayTech" });
  }
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: corsHeaders() });
}
