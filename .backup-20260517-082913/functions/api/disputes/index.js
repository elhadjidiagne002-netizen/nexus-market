// Feature 20 : Litiges — workflow complet
import { options, json, err, supabase, requireAuth, sendEmail } from '../_lib/utils.js';

const REASONS = ['not_received','not_as_described','defective','wrong_item','unauthorized','other'];

export async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') return options();
  const sb = supabase(env);
  try {
    if (request.method === 'GET') {
      const [user, e] = await requireAuth(request, env);
      if (e) return e;
      const url    = new URL(request.url);
      const status = url.searchParams.get('status');
      const base   = user.role === 'admin'
        ? 'order=created_at.desc'
        : `or=(buyer_id.eq.${user.id},vendor_id.eq.${user.id})&order=created_at.desc`;
      const qs   = status ? `${base}&status=eq.${status}` : base;
      return json(await sb.from('disputes').select('*', qs + '&limit=50') || []);
    }
    if (request.method === 'POST') {
      const [user, e] = await requireAuth(request, env);
      if (e) return e;
      const { orderId, vendorId, vendorName, reason, description, evidenceUrls } = await request.json().catch(() => ({}));
      if (!orderId || !reason || !description) return err('orderId, reason et description requis', 400);
      if (!REASONS.includes(reason)) return err(`Raison invalide: ${REASONS.join(', ')}`, 400);
      if (description.length < 20) return err('Description trop courte (min 20 car.)', 400);
      const orders = await sb.from('orders').select('id,status,total,vendor_id', `id=eq.${orderId}&buyer_id=eq.${user.id}`);
      if (!orders?.length) return err('Commande introuvable', 404);
      const order = orders[0];
      if (!['delivered','shipped','completed'].includes(order.status))
        return err('Litige possible uniquement pour commandes expédiées ou livrées', 400);
      const existing = await sb.from('disputes').select('id', `order_id=eq.${orderId}&status=in.(open,in_review,escalated)`);
      if (existing?.length) return err('Un litige est déjà ouvert sur cette commande', 409);
      const dispute = await sb.from('disputes').insert({
        order_id: orderId, buyer_id: user.id, buyer_name: user.name || user.email,
        vendor_id: vendorId || order.vendor_id, vendor_name: vendorName || '',
        reason, description, evidence_urls: evidenceUrls || [], status: 'open',
        amount_disputed: order.total,
        deadline_vendor: new Date(Date.now() + 72 * 3600000).toISOString(),
        created_at: new Date().toISOString(),
      });
      const vId = vendorId || order.vendor_id;
      if (vId) {
        await sb.from('notifications').insert({
          user_id: vId, type: 'dispute_opened', title: '⚠️ Nouveau litige',
          message: `Litige sur commande #${orderId.slice(0,8)} — ${reason}`,
          metadata: { order_id: orderId }, created_at: new Date().toISOString(),
        }).catch(() => {});
      }
      return json(Array.isArray(dispute) ? dispute[0] : dispute, 201);
    }
    return err('Méthode non supportée', 405);
  } catch (e) { return err(e.message, e.status || 500); }
}
