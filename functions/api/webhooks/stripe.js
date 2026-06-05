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

import { sendEventEmail } from '../_lib/notify.js';

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
  // create-intent pose la clé en snake_case (metadata[order_id]) ; on accepte
  // aussi la variante camelCase par tolérance.
  const orderId = pi?.metadata?.order_id || pi?.metadata?.orderId || null;

  console.log(`[Stripe webhook] ${type} | orderId=${orderId || "—"} | id=${pi?.id}`);

  // ── Dispatcher les événements ─────────────────────────────────────────────
  if (SB_URL && SB_KEY) {
    switch (type) {
      case "payment_intent.succeeded":
        await updateOrderByStripe(SB_URL, SB_KEY, {
          paymentIntentId: pi.id,
          orderId,
          kind:            "paid",
        });
        // [PUSH + NOTIF] Notifier l'acheteur du paiement confirmé
        if (orderId) {
          context.waitUntil((async () => {
            try {
              const hdrs = { "Content-Type":"application/json", apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` };
              // Récupérer l'acheteur de la commande (colonne buyer_id — cf. schéma orders)
              const oRes = await fetch(`${SB_URL}/rest/v1/orders?id=eq.${encodeURIComponent(orderId)}&select=buyer_id,buyer_email,buyer_name,total`, { headers: hdrs });
              const oData = await oRes.json();
              const order = oData?.[0] || {};
              const buyerId = order.buyer_id;
              if (!buyerId) return;
              const amountFcfa = Math.round((pi.amount_received || pi.amount || 0) / 100 * 655.957);
              // Notification Supabase (type ∈ {order,offer,message,return,vendor,system,dispute})
              await fetch(`${SB_URL}/rest/v1/notifications`, {
                method: "POST", headers: { ...hdrs, Prefer: "return=minimal" },
                body: JSON.stringify({ user_id: buyerId, type: "order", title: "✅ Paiement Stripe confirmé", message: `Paiement de ${amountFcfa.toLocaleString('fr-FR')} FCFA reçu. Commande en traitement.`, read: false, link: `/?order=${orderId}` }),
              });
              // Push notification
              const origin = new URL(request.url).origin;
              await fetch(`${origin}/push-send`, {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ userId: buyerId, eventType: "payment_confirmed", payload: { title: "✅ Paiement confirmé", body: `${amountFcfa.toLocaleString('fr-FR')} FCFA reçu — commande #${orderId.slice(-6)}`, icon: "/assets/Gemini_Generated_Image_51w43151w43151w4.png", data: { url: `/?order=${orderId}` } } }),
              });
              // Email acheteur : paiement reçu (centre de notifications)
              if (order.buyer_email) {
                await sendEventEmail(env, "payment_received", order.buyer_email, {
                  buyer_name: order.buyer_name || "Client", order_id: orderId,
                  total: amountFcfa.toLocaleString('fr-FR'), _userId: buyerId, _orderId: orderId,
                }).catch(() => {});
              }
            } catch(e) { console.warn("[Stripe webhook] push/notif error:", e.message); }
          })());
        }
        break;

      case "payment_intent.payment_failed":
        await updateOrderByStripe(SB_URL, SB_KEY, {
          paymentIntentId: pi.id,
          orderId,
          kind:            "failed",
          failureReason:   pi.last_payment_error?.message || "Échec Stripe",
        });
        break;

      case "charge.refunded": {
        // pi ici est une Charge, pas un PaymentIntent
        const rOrderId = pi.metadata?.order_id || pi.metadata?.orderId || null;
        await updateOrderByStripe(SB_URL, SB_KEY, {
          paymentIntentId: pi.payment_intent || null,
          orderId:         rOrderId,
          kind:            "refunded",
        });
        // Email acheteur : remboursement effectué (centre de notifications)
        if (rOrderId && SB_URL && SB_KEY && env.RESEND_API_KEY) {
          context.waitUntil((async () => {
            try {
              const hdrs = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` };
              const oRes = await fetch(`${SB_URL}/rest/v1/orders?id=eq.${encodeURIComponent(rOrderId)}&select=buyer_id,buyer_email,buyer_name`, { headers: hdrs });
              const o = (await oRes.json())?.[0];
              if (o?.buyer_email) {
                const amt = Math.round((pi.amount_refunded || 0) / 100 * 655.957);
                await sendEventEmail(env, "refund_processed", o.buyer_email, {
                  buyer_name: o.buyer_name || "Client", order_id: rOrderId,
                  amount: amt.toLocaleString("fr-FR"), _userId: o.buyer_id || null, _orderId: rOrderId,
                });
              }
            } catch (_) {}
          })());
        }
        break;
      }

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
async function updateOrderByStripe(sbUrl, sbKey, { paymentIntentId, orderId, kind, failureReason }) {
  // Mappe l'événement Stripe vers des colonnes/valeurs CONFORMES au schéma orders :
  //   status         ∈ {pending_payment, processing, in_transit, delivered, cancelled}
  //   payment_status ∈ {pending, paid, failed, refunded}
  // (les anciennes colonnes paid_at / paid_amount_fcfa / failure_reason n'existent
  //  pas → tout l'UPDATE était rejeté par Postgres.)
  const now = new Date().toISOString();
  let updates;
  if (kind === "paid") {
    updates = { payment_status: "paid", status: "processing", payment_method: "card", processing_at: now, updated_at: now };
  } else if (kind === "failed") {
    updates = { payment_status: "failed", updated_at: now,
      ...(failureReason ? { admin_notes: `Stripe: ${failureReason}` } : {}) };
  } else if (kind === "refunded") {
    updates = { payment_status: "refunded", updated_at: now };
  } else {
    return;
  }

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
      console.log(`[Stripe webhook] ✅ Commande ${orderId} → ${kind}`);
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
      console.log(`[Stripe webhook] ✅ Commande via pi=${paymentIntentId} → ${kind}`);
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
