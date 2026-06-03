// Stripe webhook — vérification HMAC SHA-256 OBLIGATOIRE
// (endpoint alternatif : /api/payments/stripe/webhook ; l'endpoint documenté
//  principal est /api/webhooks/stripe — les deux partagent la même logique.)
import { adminClient } from '../../_lib/supabase.js';
import { ok, err } from '../../_lib/response.js';

export async function onRequest({ request, env }) {
  if (request.method !== 'POST') return err('POST requis', 405);

  // ── Vérification de signature OBLIGATOIRE ────────────────────────────────
  // Sans secret configuré OU sans signature valide, on rejette : un webhook
  // non vérifié permettrait à n'importe qui de forger un « paiement réussi ».
  if (!env.STRIPE_WEBHOOK_SECRET) {
    console.error('[stripe-webhook] STRIPE_WEBHOOK_SECRET manquante — webhook désactivé');
    return err('Webhook secret non configuré', 503);
  }
  const raw = await request.text();
  const sig = request.headers.get('stripe-signature') || '';
  if (!(await verifyStripe(raw, sig, env.STRIPE_WEBHOOK_SECRET)))
    return err('Signature Stripe invalide', 400);

  let event;
  try { event = JSON.parse(raw); } catch { return err('JSON invalide', 400); }
  const sb = adminClient(env);
  const now = new Date().toISOString();
  try {
    switch (event.type) {
      case 'payment_intent.succeeded': {
        const pi = event.data.object;
        const orderId = pi.metadata?.order_id || pi.metadata?.orderId;
        if (orderId) {
          // Colonnes/valeurs conformes au schéma orders :
          // status ∈ {pending_payment,processing,in_transit,delivered,cancelled}
          // payment_status ∈ {pending,paid,failed,refunded} ; payment_method ∈ {card,mobile}
          await sb.from('orders').update({ status: 'processing', payment_status: 'paid',
            payment_method: 'card', stripe_payment_id: pi.id,
            processing_at: now, updated_at: now }).eq('id', orderId);
          const { data: ord } = await sb.from('orders').select('buyer_id,total').eq('id', orderId).single();
          if (ord?.buyer_id) await sb.from('notifications').insert({
            user_id: ord.buyer_id, type: 'order', title: 'Paiement confirmé',
            message: `${(ord.total||0).toLocaleString('fr-FR')} FCFA reçu via Stripe`,
            read: false, link: `/?order=${orderId}` });
        }
        break;
      }
      case 'checkout.session.completed': {
        const s = event.data.object;
        const orderId = s.metadata?.order_id || s.metadata?.orderId;
        if (orderId) await sb.from('orders').update({ status: 'processing', payment_status: 'paid',
          payment_method: 'card', stripe_payment_id: s.payment_intent,
          processing_at: now, updated_at: now }).eq('id', orderId);
        break;
      }
      case 'payment_intent.payment_failed': {
        const pi = event.data.object;
        const orderId = pi.metadata?.order_id || pi.metadata?.orderId;
        if (orderId) await sb.from('orders').update({ payment_status: 'failed', updated_at: now,
          ...(pi.last_payment_error?.message ? { admin_notes: `Stripe: ${pi.last_payment_error.message}` } : {}) }).eq('id', orderId);
        break;
      }
      case 'charge.refunded': {
        const c = event.data.object;
        const orderId = c.metadata?.order_id || c.metadata?.orderId;
        // payment_status n'autorise pas 'partially_refunded' → 'refunded' dans les deux cas.
        if (orderId) await sb.from('orders').update({
          payment_status: 'refunded', updated_at: now }).eq('id', orderId);
        break;
      }
      default: console.log('[stripe-webhook] Non géré:', event.type);
    }
  } catch (e) { console.error('[stripe-webhook]', e.message); }
  return ok({ received: true });
}

async function verifyStripe(payload, header, secret) {
  if (!header) return false;
  const parts = Object.fromEntries(header.split(',').map(p => p.split('=').map(s => s.trim())));
  const { t, v1 } = parts;
  if (!t || !v1) return false;
  // Anti-replay : rejeter les webhooks de plus de 5 minutes.
  const ts = parseInt(t, 10);
  if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > 300) {
    console.warn('[stripe-webhook] Timestamp hors tolérance — possible replay');
    return false;
  }
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${t}.${payload}`));
  const hex = Array.from(new Uint8Array(mac)).map(b => b.toString(16).padStart(2,'0')).join('');
  return timingSafeEqual(hex, v1);
}

// Comparaison en temps constant — évite les timing attacks
function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
