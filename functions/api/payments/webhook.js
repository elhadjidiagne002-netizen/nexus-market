import { CORS, options, json, err, supabase, sendEmail } from '../../../_lib/utils.js';

export async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') return options();
  if (request.method !== 'POST') return err('POST requis', 405);
  try {
    if (!env.STRIPE_WEBHOOK_SECRET) return err('Webhook secret manquant', 503);
    const sig = request.headers.get('stripe-signature');
    const rawBody = await request.text();

    // Vérification signature Stripe (HMAC-SHA256)
    const encoder = new TextEncoder();
    const parts = sig.split(',').reduce((acc, p) => {
      const [k, v] = p.split('=');
      acc[k] = v;
      return acc;
    }, {});
    const payload = \`\${parts.t}.\${rawBody}\`;
    const key = await crypto.subtle.importKey('raw', encoder.encode(env.STRIPE_WEBHOOK_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
    const expectedSig = Array.from(new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(payload)))).map(b => b.toString(16).padStart(2,'0')).join('');
    if (expectedSig !== parts.v1) return err('Signature invalide', 400);

    const event = JSON.parse(rawBody);
    const sb = supabase(env);

    if (event.type === 'payment_intent.succeeded') {
      const pi = event.data.object;
      const orderId = pi.metadata?.order_id;
      if (orderId) {
        const updated = await sb.from('orders').update({ status: 'paid', stripe_payment_id: pi.id }, \`id=eq.\${orderId}\`);
        const order = Array.isArray(updated) ? updated[0] : updated;
        if (order?.buyer_id) {
          await sb.from('notifications').insert({
            user_id: order.buyer_id, type: 'success', title: 'Paiement confirmé',
            message: \`Votre paiement de \${(pi.amount/100).toFixed(2)} EUR a été accepté.\`,
          }).catch(() => {});
        }
      }
    }

    if (event.type === 'payment_intent.payment_failed') {
      const pi = event.data.object;
      const orderId = pi.metadata?.order_id;
      if (orderId) {
        await sb.from('orders').update({ status: 'cancelled' }, \`id=eq.\${orderId}\`);
      }
    }

    if (event.type === 'charge.refunded') {
      const charge = event.data.object;
      const orderId = charge.metadata?.order_id;
      if (orderId) {
        await sb.from('orders').update({ status: 'refunded' }, \`id=eq.\${orderId}\`);
      }
    }

    return json({ received: true });
  } catch (e) { return err(e.message, 500); }
}
