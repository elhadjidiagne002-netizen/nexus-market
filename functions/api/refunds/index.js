import { CORS, options, json, err, supabase, requireAuth } from '../../_lib/utils.js';

export async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') return options();
  try {
    const [user, e] = await requireAuth(request, env);
    if (e) return e;
    if (request.method !== 'POST') return err('POST requis', 405);
    const { orderId, amount, reason } = await request.json();
    if (!orderId) return err('orderId requis', 400);
    const sb = supabase(env);
    const orders = await sb.from('orders').select('*', `id=eq.${orderId}`);
    if (!orders?.length) return err('Commande introuvable', 404);
    const order = orders[0];
    if (order.buyer_id !== user.id && user.role !== 'admin') return err('Accès refusé', 403);
    // Si Stripe: créer un remboursement
    if (order.stripe_payment_id && env.STRIPE_SECRET_KEY) {
      const body = new URLSearchParams({ payment_intent: order.stripe_payment_id });
      if (amount) body.append('amount', Math.round(amount * 100).toString());
      const res = await fetch('https://api.stripe.com/v1/refunds', {
        method: 'POST',
        headers: { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      });
      const data = await res.json();
      if (!res.ok) return err(data.error?.message || 'Erreur remboursement Stripe', res.status);
    }
    await sb.from('orders').update({ status: 'refunded' }, `id=eq.${orderId}`);
    return json({ success: true });
  } catch (e) { return err(e.message, e.status || 500); }
}



