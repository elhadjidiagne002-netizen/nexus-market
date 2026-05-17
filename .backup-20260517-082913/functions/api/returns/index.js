// Feature 21 : Retours — workflow complet (7 jours)
import { options, json, err, supabase, requireAuth, sendEmail } from '../_lib/utils.js';

const WINDOW_DAYS = 7;
const CATS = ['defective','wrong_item','not_as_described','changed_mind','damaged_in_transit','other'];

export async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') return options();
  const sb = supabase(env);
  try {
    const [user, e] = await requireAuth(request, env);
    if (e) return e;
    const url  = new URL(request.url);
    const page = parseInt(url.searchParams.get('page') || '1');
    const asV  = url.searchParams.get('as') === 'vendor';
    if (request.method === 'GET') {
      const filter = user.role === 'admin' ? 'order=created_at.desc'
        : (asV || user.role === 'vendor') ? `vendor_id=eq.${user.id}&order=created_at.desc`
        : `buyer_id=eq.${user.id}&order=created_at.desc`;
      return json(await sb.from('return_requests').select('*', `${filter}&limit=50&offset=${(page-1)*50}`) || []);
    }
    if (request.method === 'POST') {
      const { orderId, vendorId, vendorName, products: items, orderTotal, category, categoryLabel, description, photos, preferredRefund } = await request.json().catch(() => ({}));
      if (!orderId || !category) return err('orderId et category requis', 400);
      if (!CATS.includes(category)) return err(`Catégorie invalide: ${CATS.join(',')}`, 400);
      const orders = await sb.from('orders').select('id,status,total,vendor_id,delivered_at,payment_status',
        `id=eq.${orderId}&buyer_id=eq.${user.id}`);
      if (!orders?.length) return err('Commande introuvable', 404);
      const order = orders[0];
      if (order.status !== 'delivered') return err('Retour uniquement pour commandes livrées', 400);
      if (order.payment_status !== 'paid') return err('Commande non payée', 400);
      if (order.delivered_at) {
        const deadline = new Date(new Date(order.delivered_at).getTime() + WINDOW_DAYS * 86400000);
        if (new Date() > deadline) return err(`Délai de ${WINDOW_DAYS} jours écoulé`, 400);
      }
      const existing = await sb.from('return_requests').select('id',
        `order_id=eq.${orderId}&status=in.(pending,approved,in_transit)`);
      if (existing?.length) return err('Demande déjà en cours', 409);
      const vId = vendorId || order.vendor_id;
      const ret = await sb.from('return_requests').insert({
        order_id: orderId, buyer_id: user.id, buyer_name: user.name || user.email,
        buyer_email: user.email, vendor_id: vId, vendor_name: vendorName || '',
        products: items || [], order_total: orderTotal || order.total,
        category, category_label: categoryLabel || category,
        description: description || '', photos: photos || [],
        preferred_refund: preferredRefund || 'original', status: 'pending',
        deadline_vendor: new Date(Date.now() + 48 * 3600000).toISOString(),
        created_at: new Date().toISOString(),
      });
      if (vId) {
        await sb.from('notifications').insert({
          user_id: vId, type: 'return_requested', title: '↩️ Demande de retour',
          message: `Retour sur commande #${orderId.slice(0,8)}`,
          metadata: { order_id: orderId }, created_at: new Date().toISOString(),
        }).catch(() => {});
      }
      return json(Array.isArray(ret) ? ret[0] : ret, 201);
    }
    if (request.method === 'PATCH') {
      const id     = url.searchParams.get('id');
      const action = url.searchParams.get('action');
      if (!id) return err('id requis', 400);
      const body  = await request.json().catch(() => ({}));
      const rets  = await sb.from('return_requests').select('*', `id=eq.${id}&vendor_id=eq.${user.id}`);
      if (!rets?.length) return err('Retour introuvable', 404);
      const ret = rets[0];
      if (action === 'approve')
        await sb.from('return_requests').update({ status: 'approved',
          return_instructions: body.instructions || 'Envoyez le colis.',
          return_address: body.address || null, approved_at: new Date().toISOString() }, `id=eq.${id}`);
      else if (action === 'reject')
        await sb.from('return_requests').update({ status: 'rejected', rejection_reason: body.reason || null }, `id=eq.${id}`);
      else if (action === 'received') {
        await sb.from('return_requests').update({ status: 'received', condition_ok: body.conditionOk !== false,
          vendor_notes: body.notes || null, received_at: new Date().toISOString(),
          refund_status: body.conditionOk !== false ? 'pending' : 'rejected' }, `id=eq.${id}`);
        if (body.conditionOk !== false) {
          await sb.from('notifications').insert({
            user_id: ret.buyer_id, type: 'refund_initiated', title: '💰 Remboursement en cours',
            message: `${(ret.order_total||0).toLocaleString()} FCFA en cours de traitement`,
            metadata: { return_id: id }, created_at: new Date().toISOString(),
          }).catch(() => {});
        }
      } else return err('action: approve|reject|received', 400);
      await sb.from('notifications').insert({
        user_id: ret.buyer_id,
        type: action === 'approve' ? 'return_approved' : action === 'reject' ? 'return_rejected' : 'return_received',
        title: action === 'approve' ? '✅ Retour approuvé' : action === 'reject' ? '❌ Retour refusé' : '📦 Colis reçu',
        message: body.reason || body.instructions || 'Votre demande a été traitée.',
        metadata: { return_id: id }, created_at: new Date().toISOString(),
      }).catch(() => {});
      return json({ ok: true, action });
    }
    return err('Méthode non supportée', 405);
  } catch (e) { return err(e.message, e.status || 500); }
}
