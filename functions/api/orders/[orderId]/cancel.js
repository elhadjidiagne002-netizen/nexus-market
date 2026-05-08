import { CORS, options, json, err, supabase, requireAuth } from '../../../../../_lib/utils.js';

export async function onRequest({ request, env, params }) {
  if (request.method === 'OPTIONS') return options();
  try {
    const [user, e] = await requireAuth(request, env);
    if (e) return e;
    const sb = supabase(env);
    const orders = await sb.from('orders').select('*', `id=eq.${params.orderId}`);
    if (!orders?.length) return err('Commande introuvable', 404);
    const order = orders[0];
    if (order.buyer_id !== user.id && user.role !== 'admin') return err('Accès refusé', 403);
    if (['shipped','delivered'].includes(order.status)) return err('Impossible d'annuler une commande déjà expédiée', 400);
    const updated = await sb.from('orders').update({ status: 'cancelled' }, `id=eq.${params.orderId}`);
    // Notifier le vendeur
    if (order.vendor_id) {
      await sb.from('notifications').insert({
        user_id: order.vendor_id, type: 'warning', title: 'Commande annulée',
        message: \`La commande #\${params.orderId.slice(0,8)} de \${order.buyer_name} a été annulée.\`,
      }).catch(() => {});
    }
    return json(Array.isArray(updated) ? updated[0] : updated);
  } catch (e) { return err(e.message, e.status || 500); }
}
