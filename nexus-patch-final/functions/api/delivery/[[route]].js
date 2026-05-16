// functions/api/delivery/[[route]].js — Feature 14 : Suivi livraison temps réel
// POST /api/delivery/webhook          → webhook transporteur (secret)
// GET  /api/delivery/[orderId]        → timeline client
import { options, json, err, supabase, requireAuth, sendEmail } from '../_lib/utils.js';

const STATUS_LABELS = {
  picked_up: 'Colis collecté', in_transit: 'En transit',
  out_for_delivery: 'En cours de livraison', delivered: 'Livré',
  failed_delivery: 'Tentative échouée', returned: 'Retourné', customs_hold: 'Retenu en douane',
};
const STATUS_ICONS = {
  picked_up: '📦', in_transit: '🚚', out_for_delivery: '🛵',
  delivered: '✅', failed_delivery: '⚠️', returned: '↩️', customs_hold: '🏛️',
};
const STATUS_MAP = {
  picked_up: 'shipped', in_transit: 'shipped', out_for_delivery: 'out_for_delivery',
  delivered: 'delivered', failed_delivery: 'delivery_failed', returned: 'returned',
};

export async function onRequest({ request, env, params }) {
  if (request.method === 'OPTIONS') return options();
  const sb    = supabase(env);
  const route = params?.route || '';

  try {
    // ── POST /api/delivery/webhook ────────────────────────────────
    if (request.method === 'POST' && route === 'webhook') {
      const secret = request.headers.get('x-delivery-secret');
      if (secret !== env.DELIVERY_WEBHOOK_SECRET) return err('Unauthorized', 401);

      const body = await request.json().catch(() => ({}));
      const { order_id, tracking_number, status, location, timestamp, carrier, note, estimated_delivery } = body;

      if (!order_id || !status) return err('order_id et status requis', 400);
      if (!STATUS_LABELS[status]) return err(`Statut invalide: ${Object.keys(STATUS_LABELS).join(', ')}`, 400);

      // Insérer l'événement
      await sb.from('delivery_events').insert({
        order_id, tracking_number, status,
        location: location || null, carrier: carrier || null, note: note || null,
        occurred_at: timestamp || new Date().toISOString(),
      });

      // Mettre à jour la commande
      const updateData = { delivery_status: STATUS_MAP[status] || status, updated_at: new Date().toISOString() };
      if (tracking_number) updateData.tracking_number = tracking_number;
      if (estimated_delivery) updateData.estimated_delivery = estimated_delivery;
      await sb.from('orders').update(updateData, `id=eq.${order_id}`);

      // Notifier l'acheteur
      const orders = await sb.from('orders').select('buyer_id', `id=eq.${order_id}`);
      if (orders?.[0]?.buyer_id) {
        await sb.from('notifications').insert({
          user_id: orders[0].buyer_id, type: 'delivery_update',
          title: STATUS_LABELS[status], icon: STATUS_ICONS[status],
          message: location ? `${STATUS_LABELS[status]} — ${location}` : STATUS_LABELS[status],
          metadata: { order_id, status, location, tracking_number },
          created_at: new Date().toISOString(),
        }).catch(() => {});
      }

      return json({ ok: true });
    }

    // ── GET /api/delivery/[orderId] ───────────────────────────────
    if (request.method === 'GET' && route) {
      const [user, e] = await requireAuth(request, env);
      if (e) return e;

      const orderId = Array.isArray(route) ? route[0] : route;

      // Vérifier l'accès
      const orders = await sb.from('orders').select(
        'id,delivery_status,tracking_number,estimated_delivery,carrier',
        `id=eq.${orderId}&or=(buyer_id.eq.${user.id},vendor_id.eq.${user.id})`
      );
      if (!orders?.length) return err('Commande introuvable', 404);

      const events = await sb.from('delivery_events').select('*', `order_id=eq.${orderId}&order=occurred_at.asc`);

      const STEPS = [
        { status: 'picked_up', label: 'Collecte', icon: '📦' },
        { status: 'in_transit', label: 'Transit', icon: '🚚' },
        { status: 'out_for_delivery', label: 'Livraison', icon: '🛵' },
        { status: 'delivered', label: 'Livré', icon: '✅' },
      ];
      const stepOrder = STEPS.map(s => s.status);

      return json({
        order:    orders[0],
        timeline: (events || []).map(e => ({
          id: e.id, status: e.status, label: STATUS_LABELS[e.status] || e.status,
          icon: STATUS_ICONS[e.status] || '📍', location: e.location, note: e.note, at: e.occurred_at,
        })),
        steps: STEPS.map(step => ({
          ...step,
          completed: (events || []).some(e => stepOrder.indexOf(e.status) >= stepOrder.indexOf(step.status)),
          active: orders[0].delivery_status === STATUS_MAP[step.status],
        })),
      });
    }

    return err('Route introuvable', 404);
  } catch (e) { return err(e.message, e.status || 500); }
}
