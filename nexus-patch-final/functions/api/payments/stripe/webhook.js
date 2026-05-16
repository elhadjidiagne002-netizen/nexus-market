// functions/api/payments/stripe/webhook.js — Feature 25 : Stripe webhook (HMAC vérifié)
// Remplace la version sans vérification de signature
import { adminClient } from '../../_lib/supabase.js';
import { ok, err } from '../../_lib/response.js';

export async function onRequest({ request, env }) {
  if (request.method !== 'POST') return err('POST requis', 405);

  const rawBody   = await request.text();
  const sigHeader = request.headers.get('stripe-signature') || '';
  const secret    = env.STRIPE_WEBHOOK_SECRET;

  // ── Vérification signature HMAC SHA-256 ───────────────────────
  if (secret) {
    const valid = await verifyStripeSignature(rawBody, sigHeader, secret);
    if (!valid) return err('Signature Stripe invalide', 400);
  }

  let event;
  try { event = JSON.parse(rawBody); } catch { return err('JSON invalide', 400); }

  const sb = adminClient(env);

  try {
    switch (event.type) {
      // ── Paiement réussi (Payment Intent) ──────────────────────
      case 'payment_intent.succeeded': {
        const pi      = event.data.object;
        const orderId = pi.metadata?.orderId || pi.metadata?.order_id;
        if (orderId) {
          await sb.from('orders').update({
            status:             'processing',
            payment_status:     'paid',
            payment_method:     'stripe',
            stripe_payment_id:  pi.id,
            stripe_payment_intent: pi.id,
            paid_at:            new Date().toISOString(),
          }).eq('id', orderId);

          // Notification acheteur
          const { data: orders } = await sb.from('orders').select('buyer_id,total').eq('id', orderId).single();
          if (orders?.buyer_id) {
            await sb.from('notifications').insert({
              user_id: orders.buyer_id, type: 'payment_received',
              title: '✅ Paiement confirmé',
              message: `Votre paiement de ${(orders.total || 0).toLocaleString()} FCFA a été confirmé.`,
              metadata: { order_id: orderId, payment_id: pi.id },
              created_at: new Date().toISOString(),
            });
          }
        }
        break;
      }

      // ── Session Checkout réussie ───────────────────────────────
      case 'checkout.session.completed': {
        const session = event.data.object;
        const orderId = session.metadata?.orderId || session.metadata?.order_id;
        if (orderId) {
          await sb.from('orders').update({
            status:           'processing',
            payment_status:   'paid',
            payment_method:   'stripe',
            stripe_payment_id: session.payment_intent,
            paid_at:          new Date().toISOString(),
          }).eq('id', orderId);

          // Enregistrer la session
          await sb.from('stripe_sessions').upsert({
            session_id:      session.id,
            payment_intent:  session.payment_intent,
            order_id:        orderId,
            amount:          session.amount_total,
            status:          'completed',
            updated_at:      new Date().toISOString(),
          }, { onConflict: 'session_id' }).catch(() => {});
        }
        break;
      }

      // ── Paiement échoué ────────────────────────────────────────
      case 'payment_intent.payment_failed': {
        const pi      = event.data.object;
        const orderId = pi.metadata?.orderId || pi.metadata?.order_id;
        if (orderId) {
          await sb.from('orders').update({ payment_status: 'failed' }).eq('id', orderId);

          const { data: orders } = await sb.from('orders').select('buyer_id').eq('id', orderId).single();
          if (orders?.buyer_id) {
            await sb.from('notifications').insert({
              user_id: orders.buyer_id, type: 'payment_failed',
              title: '❌ Paiement échoué',
              message: 'Votre paiement Stripe a échoué. Veuillez réessayer.',
              metadata: { order_id: orderId },
              created_at: new Date().toISOString(),
            });
          }
        }
        break;
      }

      // ── Remboursement ──────────────────────────────────────────
      case 'charge.refunded': {
        const charge  = event.data.object;
        const orderId = charge.metadata?.orderId || charge.metadata?.order_id;
        if (orderId) {
          const isFullRefund = charge.amount_refunded >= charge.amount;
          await sb.from('orders').update({
            payment_status:  isFullRefund ? 'refunded' : 'partially_refunded',
            refunded_amount: charge.amount_refunded,
          }).eq('id', orderId);
        }
        break;
      }

      default:
        console.log('[stripe-webhook] Événement non géré:', event.type);
    }
  } catch (e) {
    console.error('[stripe-webhook] Erreur:', e.message);
    // Retourner 200 quand même pour éviter les retries Stripe infinis
  }

  return ok({ received: true });
}

// ── Vérification signature HMAC SHA-256 (RFC Stripe) ──────────────────────────
async function verifyStripeSignature(payload, header, secret) {
  if (!header) return false;
  const parts = {};
  header.split(',').forEach(part => {
    const [k, v] = part.split('=');
    if (k && v) parts[k.trim()] = v.trim();
  });

  const { t: timestamp, v1: signature } = parts;
  if (!timestamp || !signature) return false;

  const signedPayload = `${timestamp}.${payload}`;
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signedPayload));
  const computed = Array.from(new Uint8Array(mac)).map(b => b.toString(16).padStart(2, '0')).join('');

  return computed === signature;
}
