// Feature 25 : Stripe webhook — vérification HMAC SHA-256
import { adminClient } from '../../_lib/supabase.js';
import { ok, err } from '../../_lib/response.js';

export async function onRequest({ request, env }) {
  if (request.method !== 'POST') return err('POST requis', 405);
  const raw = await request.text();
  const sig = request.headers.get('stripe-signature') || '';
  if (env.STRIPE_WEBHOOK_SECRET && !(await verifyStripe(raw, sig, env.STRIPE_WEBHOOK_SECRET)))
    return err('Signature Stripe invalide', 400);
  let event;
  try { event = JSON.parse(raw); } catch { return err('JSON invalide', 400); }
  const sb = adminClient(env);
  try {
    switch (event.type) {
      case 'payment_intent.succeeded': {
        const pi = event.data.object;
        const orderId = pi.metadata?.orderId || pi.metadata?.order_id;
        if (orderId) {
          await sb.from('orders').update({ status: 'processing', payment_status: 'paid',
            payment_method: 'stripe', stripe_payment_id: pi.id,
            stripe_payment_intent: pi.id, paid_at: new Date().toISOString() }).eq('id', orderId);
          const { data: ord } = await sb.from('orders').select('buyer_id,total').eq('id', orderId).single();
          if (ord?.buyer_id) await sb.from('notifications').insert({
            user_id: ord.buyer_id, type: 'payment_received', title: '✅ Paiement confirmé',
            message: `${(ord.total||0).toLocaleString()} FCFA reçu via Stripe`,
            metadata: { order_id: orderId }, created_at: new Date().toISOString() });
        }
        break;
      }
      case 'checkout.session.completed': {
        const s = event.data.object;
        const orderId = s.metadata?.orderId || s.metadata?.order_id;
        if (orderId) await sb.from('orders').update({ status: 'processing', payment_status: 'paid',
          payment_method: 'stripe', stripe_payment_id: s.payment_intent,
          paid_at: new Date().toISOString() }).eq('id', orderId);
        break;
      }
      case 'payment_intent.payment_failed': {
        const pi = event.data.object;
        const orderId = pi.metadata?.orderId || pi.metadata?.order_id;
        if (orderId) await sb.from('orders').update({ payment_status: 'failed' }).eq('id', orderId);
        break;
      }
      case 'charge.refunded': {
        const c = event.data.object;
        const orderId = c.metadata?.orderId || c.metadata?.order_id;
        if (orderId) await sb.from('orders').update({
          payment_status: c.amount_refunded >= c.amount ? 'refunded' : 'partially_refunded',
          refunded_amount: c.amount_refunded }).eq('id', orderId);
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
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${t}.${payload}`));
  const hex = Array.from(new Uint8Array(mac)).map(b => b.toString(16).padStart(2,'0')).join('');
  return hex === v1;
}
