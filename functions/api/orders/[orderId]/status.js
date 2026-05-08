import { CORS, options, json, err, supabase, requireAuth, sendEmail } from '../../../../../_lib/utils.js';

export async function onRequest({ request, env, params }) {
  if (request.method === 'OPTIONS') return options();
  try {
    const [user, e] = await requireAuth(request, env);
    if (e) return e;
    if (!['vendor','admin'].includes(user.role)) return err('Accès refusé', 403);
    const { status, trackingNumber } = await request.json();
    const allowed = ['processing','paid','shipped','delivered','cancelled','refunded'];
    if (!allowed.includes(status)) return err('Statut invalide', 400);
    const sb = supabase(env);
    const updates = { status };
    if (trackingNumber) updates.tracking_number = trackingNumber;
    const data = await sb.from('orders').update(updates, `id=eq.${params.orderId}`);
    const order = Array.isArray(data) ? data[0] : data;
    // Notifier l'acheteur
    if (order?.buyer_id) {
      const labels = { shipped: 'Commande expédiée', delivered: 'Commande livrée', cancelled: 'Commande annulée' };
      if (labels[status]) {
        await sb.from('notifications').insert({
          user_id: order.buyer_id, type: status === 'cancelled' ? 'warning' : 'success',
          title: labels[status],
          message: trackingNumber ? \`N° de suivi : \${trackingNumber}\` : \`Votre commande #\${params.orderId.slice(0,8)} est \${status}.\`,
        }).catch(() => {});
      }
    }
    return json(order);
  } catch (e) { return err(e.message, e.status || 500); }
}
