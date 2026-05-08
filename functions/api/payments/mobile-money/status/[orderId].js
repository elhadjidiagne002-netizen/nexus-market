import { CORS, options, json, err, supabase, requireAuth } from '../../../../../../_lib/utils.js';

export async function onRequest({ request, env, params }) {
  if (request.method === 'OPTIONS') return options();
  try {
    const [user, e] = await requireAuth(request, env);
    if (e) return e;
    const sb = supabase(env);
    const orders = await sb.from('orders').select('*', \`id=eq.\${params.orderId}\`);
    if (!orders?.length) return err('Commande introuvable', 404);
    const order = orders[0];
    if (order.buyer_id !== user.id && user.role !== 'admin') return err('Accès refusé', 403);
    // Retourner le statut actuel — à connecter à l'API Wave/OM si disponible
    return json({ orderId: params.orderId, status: order.status, paymentMethod: order.payment_method });
  } catch (e) { return err(e.message, 500); }
}
