// ── POST /api/webhooks/stripe ───────────────────────────────────────────────
// Reçoit les événements Stripe (payment_intent.succeeded, payment_failed…).
// Cloudflare Pages Function — runtime Workers (V8, pas Node.js).
//
// ⚠️  SÉCURITÉ — Vérification de signature obligatoire :
//   Stripe signe chaque webhook avec STRIPE_WEBHOOK_SECRET (whsec_...).
//   Sans cette vérification, n'importe qui pourrait forger un "paiement réussi".
//
// Variables d'environnement requises :
//   STRIPE_WEBHOOK_SECRET  — whsec_... (Stripe Dashboard → Webhooks → Signing secret)
//   SUPABASE_URL           / SUPABASE_SERVICE_KEY
//
// Événements traités :
//   payment_intent.succeeded        → commande marquée "paid"
//   payment_intent.payment_failed   → commande marquée "failed"
//   charge.refunded                 → commande marquée "refunded"
//
// Config Stripe Dashboard → Developers → Webhooks :
//   Endpoint URL : https://<votre-site>.pages.dev/api/webhooks/stripe
//   Événements  : payment_intent.succeeded, payment_intent.payment_failed, charge.refunded

export async function onRequestPost(context) {
  const { request, env } = context;

  const WEBHOOK_SECRET = env.STRIPE_WEBHOOK_SECRET;
  const SB_URL         = env.SUPABASE_URL;
  const SB_KEY         = env.SUPABASE_SERVICE_KEY;

  if (!WEBHOOK_SECRET) {
    console.error("[Stripe webhook] STRIPE_WEBHOOK_SECRET manquante — webhook désactivé");
    return new Response("Webhook secret not configured", { status: 500 });
  }

  // ── Lire le corps brut (requis pour la vérification de signature) ─────────
  const rawBody = await request.text();
  const sigHeader = request.headers.get("stripe-signature");

  if (!sigHeader) {
    return new Response("Missing Stripe-Signature", { status: 400 });
  }

  // ── Vérifier la signature Stripe ─────────────────────────────────────────
  // Algorithme : HMAC-SHA256(webhook_secret, "{timestamp}.{payload}")
  // Header format : "t=1234567890,v1=abc123...,v0=..."
  const isValid = await verifyStripeSignature(rawBody, sigHeader, WEBHOOK_SECRET);
  if (!isValid) {
    console.error("[Stripe webhook] Signature invalide — événement rejeté");
    return new Response("Invalid signature", { status: 401 });
  }

  // ── Parser l'événement ────────────────────────────────────────────────────
  let event;
  try { event = JSON.parse(rawBody); }
  catch { return new Response("Invalid JSON", { status: 400 }); }

  const { type, data } = event;
  const pi      = data?.object;           // PaymentIntent ou Charge selon l'event
  const orderId = pi?.metadata?.orderId;  // mis en metadata par create-intent

  console.log(`[Stripe webhook] ${type} | orderId=${orderId || "—"} | id=${pi?.id}`);

  // ── Dispatcher les événements ─────────────────────────────────────────────
  if (SB_URL && SB_KEY) {
    switch (type) {
      case "payment_intent.succeeded":
        await updateOrderByStripe(SB_URL, SB_KEY, {
          paymentIntentId: pi.id,
          orderId,
          status:          "paid",
          paidAmountFcfa:  Math.round((pi.amount_received || pi.amount || 0) / 100 * 655.957),
          paidAt:          new Date().toISOString(),
        });
        break;

      case "payment_intent.payment_failed":
        await updateOrderByStripe(SB_URL, SB_KEY, {
          paymentIntentId: pi.id,
          orderId,
          status:          "failed",
          failureReason:   pi.last_payment_error?.message || "Échec Stripe",
        });
        break;

      case "charge.refunded":
        // pi ici est une Charge, pas un PaymentIntent
        await updateOrderByStripe(SB_URL, SB_KEY, {
          paymentIntentId: pi.payment_intent || null,
          orderId:         pi.metadata?.orderId || null,
          status:          "refunded",
        });
        break;

      default:
        // Événement non géré — répondre 200 quand même pour éviter les retransmissions Stripe
        break;
    }
  }

  // Stripe exige un 200 rapide pour confirmer réception
  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Mise à jour de la commande dans Supabase
// Cherche d'abord par orderId (metadata), puis par stripe_payment_id.
// ─────────────────────────────────────────────────────────────────────────────
async function updateOrderByStripe(sbUrl, sbKey, { paymentIntentId, orderId, status, paidAmountFcfa, paidAt, failureReason }) {
  const updates = {
    status,
    updated_at: new Date().toISOString(),
    ...(paidAmountFcfa ? { paid_amount_fcfa: paidAmountFcfa } : {}),
    ...(paidAt         ? { paid_at:          paidAt         } : {}),
    ...(failureReason  ? { failure_reason:   failureReason  } : {}),
  };

  const headers = {
    "Content-Type":  "application/json",
    "apikey":        sbKey,
    "Authorization": `Bearer ${sbKey}`,
    "Prefer":        "return=minimal",
  };

  // 1) Mise à jour par orderId si disponible (le plus fiable)
  if (orderId) {
    const r = await fetch(
      `${sbUrl}/rest/v1/orders?id=eq.${encodeURIComponent(orderId)}`,
      { method: "PATCH", headers, body: JSON.stringify(updates) }
    ).catch(e => { console.error("[Stripe webhook] Supabase PATCH by orderId :", e.message); return null; });
    if (r && r.ok) {
      console.log(`[Stripe webhook] ✅ Commande ${orderId} → ${status}`);
      return;
    }
  }

  // 2) Fallback : mise à jour par stripe_payment_id
  if (paymentIntentId) {
    const r = await fetch(
      `${sbUrl}/rest/v1/orders?stripe_payment_id=eq.${encodeURIComponent(paymentIntentId)}`,
      { method: "PATCH", headers, body: JSON.stringify(updates) }
    ).catch(e => { console.error("[Stripe webhook] Supabase PATCH by stripe_payment_id :", e.message); return null; });
    if (r && r.ok) {
      console.log(`[Stripe webhook] ✅ Commande via pi=${paymentIntentId} → ${status}`);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Vérification de la signature Stripe
// https://stripe.com/docs/webhooks/signatures
// ─────────────────────────────────────────────────────────────────────────────
async function verifyStripeSignature(payload, sigHeader, secret) {
  try {
    // Extraire timestamp et signature(s) depuis le header
    const parts = Object.fromEntries(
      sigHeader.split(",").map(p => p.split("=").map(s => s.trim()))
    );
    const timestamp = parts["t"];
    const v1        = parts["v1"];

    if (!timestamp || !v1) return false;

    // Tolérance : rejeter les webhooks de plus de 5 minutes (anti-replay)
    const ts = parseInt(timestamp, 10);
    if (Math.abs(Date.now() / 1000 - ts) > 300) {
      console.warn("[Stripe webhook] Timestamp trop ancien — possible replay attack");
      return false;
    }

    // Calculer le HMAC-SHA256
    const signedPayload = `${timestamp}.${payload}`;
    const enc     = new TextEncoder();
    const keyData = enc.encode(secret);
    const msgData = enc.encode(signedPayload);

    const cryptoKey = await crypto.subtle.importKey(
      "raw", keyData,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const hashBuffer = await crypto.subtle.sign("HMAC", cryptoKey, msgData);
    const computed   = Array.from(new Uint8Array(hashBuffer))
      .map(b => b.toString(16).padStart(2, "0"))
      .join("");

    // Comparaison en temps constant (contre timing attacks)
    return timingSafeEqual(computed, v1);
  } catch (e) {
    console.error("[Stripe webhook] Erreur vérification signature :", e.message);
    return false;
  }
}

// Comparaison en temps constant — évite les timing attacks
function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}
