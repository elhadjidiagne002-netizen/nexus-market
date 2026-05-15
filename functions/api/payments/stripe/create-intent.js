// ── POST /api/payments/stripe/create-intent ────────────────────────────────
// Crée un Stripe PaymentIntent côté serveur et le confirme immédiatement.
// Cloudflare Pages Function — runtime Workers (V8, pas Node.js).
//
// Variables d'environnement requises (Cloudflare Pages → Settings → Variables) :
//   STRIPE_SECRET_KEY   — sk_live_... ou sk_test_...
//   SUPABASE_URL        — pour persister le payment_intent_id sur la commande
//   SUPABASE_SERVICE_KEY
//
// Corps attendu (JSON) :
//   { amount (centimes), currency, paymentMethodId, orderId? }
//
// Réponse 200 :
//   { clientSecret, status, paymentIntentId }
//
// Flux :
//   Frontend → create-intent → Stripe API → { clientSecret, status }
//   Si status === "requires_action" → stripe.confirmCardPayment(clientSecret)
//   Si status === "succeeded"       → paiement direct, rien à confirmer

export async function onRequestPost(context) {
  const { request, env } = context;

  const STRIPE_KEY = env.STRIPE_SECRET_KEY;
  const SB_URL     = env.SUPABASE_URL;
  const SB_KEY     = env.SUPABASE_SERVICE_KEY;

  if (!STRIPE_KEY || !STRIPE_KEY.startsWith("sk_")) {
    return jsonResponse({ error: "Stripe non configuré côté serveur (STRIPE_SECRET_KEY manquante)" }, 500);
  }

  // ── Corps ─────────────────────────────────────────────────────────────────
  let body;
  try { body = await request.json(); }
  catch { return jsonResponse({ error: "Corps JSON invalide" }, 400); }

  const { amount, currency = "eur", paymentMethodId, orderId } = body || {};

  if (!amount || !paymentMethodId) {
    return jsonResponse({ error: "amount et paymentMethodId sont requis" }, 400);
  }
  if (typeof amount !== "number" || amount < 50) {
    return jsonResponse({ error: "Montant invalide (minimum 50 centimes)" }, 400);
  }

  // ── Créer le PaymentIntent via l'API Stripe REST ──────────────────────────
  // On n'utilise pas le SDK Node.js (incompatible Workers) — on appelle l'API
  // REST directement avec fetch. L'API Stripe accepte application/x-www-form-urlencoded.
  const params = new URLSearchParams({
    amount:           String(Math.round(amount)),
    currency:         currency.toLowerCase(),
    payment_method:   paymentMethodId,
    confirm:          "true",
    // Retour automatique après 3D Secure — même URL que le site
    return_url:       new URL(request.url).origin + "/?stripe_return=1",
    // Metadata pour le webhook
    ...(orderId ? { "metadata[orderId]": String(orderId) } : {}),
    "metadata[source]": "nexus_market",
  });

  let stripeRes;
  try {
    stripeRes = await fetch("https://api.stripe.com/v1/payment_intents", {
      method:  "POST",
      headers: {
        "Authorization": `Bearer ${STRIPE_KEY}`,
        "Content-Type":  "application/x-www-form-urlencoded",
        "Stripe-Version": "2023-10-16",
      },
      body: params.toString(),
    });
  } catch (e) {
    return jsonResponse({ error: `Réseau Stripe inaccessible : ${e.message}` }, 502);
  }

  let pi;
  try { pi = await stripeRes.json(); }
  catch { return jsonResponse({ error: "Réponse Stripe illisible" }, 502); }

  if (!stripeRes.ok || pi.error) {
    return jsonResponse({ error: pi.error?.message || "Stripe a refusé la demande" }, 400);
  }

  // ── Persister le payment_intent_id sur la commande Supabase ──────────────
  if (SB_URL && SB_KEY && orderId && pi.id) {
    fetch(
      `${SB_URL}/rest/v1/orders?id=eq.${encodeURIComponent(orderId)}`,
      {
        method: "PATCH",
        headers: {
          "Content-Type":  "application/json",
          "apikey":        SB_KEY,
          "Authorization": `Bearer ${SB_KEY}`,
          "Prefer":        "return=minimal",
        },
        body: JSON.stringify({ stripe_payment_id: pi.id }),
      }
    ).catch(e => console.error("[Stripe intent] Supabase PATCH :", e.message));
    // fire-and-forget — on ne bloque pas la réponse
  }

  return jsonResponse({
    clientSecret:    pi.client_secret,
    status:          pi.status,          // "succeeded" | "requires_action" | "requires_confirmation"
    paymentIntentId: pi.id,
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────
function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type":                "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
