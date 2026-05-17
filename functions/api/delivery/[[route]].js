// Feature 14 : Suivi livraison temps reel
import { options, json, err, supabase, requireAuth } from '../_lib/utils.js';

const SL = { picked_up:'Colis collecte', in_transit:'En transit', out_for_delivery:'En livraison',
  delivered:'Livre', failed_delivery:'Tentative echouee', returned:'Retourne', customs_hold:'En douane' };
const SI = { picked_up:'[PKG]', in_transit:'[TRUCK]', out_for_delivery:'[MOTO]',
  delivered:'[OK]', failed_delivery:'[WARN]', returned:'[BACK]', customs_hold:'[CUSTOMS]' };
const SM = { picked_up:'shipped', in_transit:'shipped', out_for_delivery:'out_for_delivery',
  delivered:'delivered', failed_delivery:'delivery_failed', returned:'returned' };

export async function onRequest({ request, env, params }) {
  if (request.method === 'OPTIONS') return options();
  const sb    = supabase(env);
  const route = Array.isArray(params?.route) ? params.route[0] : (params?.route || '');
  try {
    if (request.method === 'POST' && route === 'webhook') {
      if (request.headers.get('x-delivery-secret') !== env.DELIVERY_WEBHOOK_SECRET)
        return err('Unauthorized', 401);
      const { order_id, tracking_number, status, location, timestamp, carrier, note, estimated_delivery } = await request.json().catch(() => ({}));
      if (!order_id || !status) return err('order_id et status requis', 400);
      if (!SL[status]) return err(`Statut invalide: ${Object.keys(SL).join(',')}`, 400);
      await sb.from('delivery_events').insert({ order_id, tracking_number, status,
        location:location||null, carrier:carrier||null, note:note||null,
        occurred_at: timestamp || new Date().toISOString() });
      const upd = { delivery_status: SM[status]||status, updated_at: new Date().toISOString() };
      if (tracking_number) upd.tracking_number = tracking_number;
      if (estimated_delivery) upd.estimated_delivery = estimated_delivery;
      await sb.from('orders').update(upd, `id=eq.${order_id}`);
      const orders = await sb.from('orders').select('buyer_id', `id=eq.${order_id}`);
      if (orders?.[0]?.buyer_id) await sb.from('notifications').insert({
        user_id: orders[0].buyer_id, type: 'delivery_update', title: SL[status], icon: SI[status],
        message: location ? `${SL[status]} - ${location}` : SL[status],
        metadata: { order_id, status, location, tracking_number }, created_at: new Date().toISOString(),
      }).catch(() => {});
      return json({ ok: true });
    }
    if (request.method === 'GET' && route) {
      const [user, e] = await requireAuth(request, env);
      if (e) return e;
      const orders = await sb.from('orders').select('id,delivery_status,tracking_number,estimated_delivery',
        `id=eq.${route}&or=(buyer_id.eq.${user.id},vendor_id.eq.${user.id})`);
      if (!orders?.length) return err('Commande introuvable', 404);
      const events = await sb.from('delivery_events').select('*', `order_id=eq.${route}&order=occurred_at.asc`) || [];
      const STEPS = [{s:'picked_up',l:'Collecte'},{s:'in_transit',l:'Transit'},{s:'out_for_delivery',l:'Livraison'},{s:'delivered',l:'Livre'}];
      const stepOrder = STEPS.map(s => s.s);
      return json({ order: orders[0], timeline: events.map(e => ({
        status: e.status, label: SL[e.status]||e.status, location: e.location, note: e.note, at: e.occurred_at })),
        steps: STEPS.map(step => ({ ...step,
          completed: events.some(e => stepOrder.indexOf(e.status) >= stepOrder.indexOf(step.s)) })) });
    }
    return err('Route introuvable', 404);
  } catch (e) { return err(e.message, e.status || 500); }
}