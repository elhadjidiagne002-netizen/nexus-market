// functions/api/returns/index.js — Feature 21 : Retours et remboursements (workflow complet)
// GET  /api/returns               → mes retours
// POST /api/returns               → créer une demande de retour
import { options, json, err, supabase, requireAuth, sendEmail } from '../_lib/utils.js';

const RETURN_WINDOW_DAYS = 7;
const CATEGORIES = ['defective','wrong_item','not_as_described','changed_mind','damaged_in_transit','other'];

export async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') return options();
  const sb = supabase(env);

  try {
    const [user, e] = await requireAuth(request, env);
    if (e) return e;

    if (request.method === 'GET') {
      const url  = new URL(request.url);
      const page = parseInt(url.searchParams.get('page') || '1');
      const as   = url.searchParams.get('as'); // 'vendor' pour vue vendeur

      const filter = user.role === 'admin'    ? 'order=created_at.desc'
        : as === 'vendor' || user.role === 'vendor' ? `vendor_id=eq.${user.id}&order=created_at.desc`
        : `buyer_id=eq.${user.id}&order=created_at.desc`;

      const data = await sb.from('return_requests').select('*', `${filter}&limit=50&offset=${(page-1)*50}`);
      return json(data || []);
    }

    if (request.method === 'POST') {
      const body = await request.json().catch(() => ({}));
      const { orderId, vendorId, vendorName, products: items, orderTotal, category, categoryLabel, description, photos, preferredRefund } = body;

      if (!orderId || !category) return err('orderId et category requis', 400);
      if (!CATEGORIES.includes(category)) return err(`Catégorie invalide: ${CATEGORIES.join(', ')}`, 400);

      // Vérifier la commande
      const orders = await sb.from('orders').select('id,status,total,vendor_id,delivered_at,payment_status', `id=eq.${orderId}&buyer_id=eq.${user.id}`);
      if (!orders?.length) return err('Commande introuvable', 404);
      const order = orders[0];

      if (order.status !== 'delivered') return err('Retour possible uniquement pour les commandes livrées', 400);
      if (order.payment_status !== 'paid') return err('Commande non payée', 400);

      // Vérifier le délai de retour
      if (order.delivered_at) {
        const deadline = new Date(new Date(order.delivered_at).getTime() + RETURN_WINDOW_DAYS * 86400000);
        if (new Date() > deadline) {
          return err(`Délai de retour de ${RETURN_WINDOW_DAYS} jours écoulé (livré le ${new Date(order.delivered_at).toLocaleDateString('fr-FR')})`, 400);
        }
      }

      // Vérifier doublon
      const existing = await sb.from('return_requests').select('id', `order_id=eq.${orderId}&status=in.(pending,approved,in_transit)`);
      if (existing?.length) return err('Une demande de retour est déjà en cours', 409);

      const returnReq = await sb.from('return_requests').insert({
        order_id:    orderId,
        buyer_id:    user.id,
        buyer_name:  user.name || user.email,
        buyer_email: user.email,
        vendor_id:   vendorId || order.vendor_id,
        vendor_name: vendorName || '',
        products:    items || [],
        order_total: orderTotal || order.total,
        category,
        category_label:   categoryLabel || category,
        description:      description || '',
        photos:           photos || [],
        preferred_refund: preferredRefund || 'original',
        status:           'pending',
        deadline_vendor:  new Date(Date.now() + 48 * 3600000).toISOString(),
        created_at:       new Date().toISOString(),
      });

      // Email vendeur
      const vId = vendorId || order.vendor_id;
      if (vId) {
        const vendors = await sb.from('profiles').select('email,name', `id=eq.${vId}`).catch(() => []);
        if (vendors?.[0]?.email) {
          await sendEmail(env, {
            to: vendors[0].email,
            subject: `↩️ Demande de retour — Commande #${orderId.slice(0, 8)}`,
            html: `<p>Un retour a été demandé pour la commande <strong>#${orderId.slice(0, 8)}</strong>.</p>
                   <p><strong>Raison :</strong> ${categoryLabel || category}</p>
                   <p><strong>Description :</strong> ${description}</p>
                   <p>Vous avez <strong>48h</strong> pour approuver ou refuser.</p>`,
          });
        }
      }

      // Email acheteur
      await sendEmail(env, {
        to: user.email,
        subject: `↩️ Demande de retour enregistrée — #${orderId.slice(0, 8)}`,
        html: `<p>Votre demande de retour a été enregistrée.</p>
               <p>Le vendeur a <strong>48h</strong> pour répondre.</p>`,
      }).catch(() => {});

      // Notification Supabase
      await sb.from('notifications').insert({
        user_id: vId, type: 'return_requested', title: '↩️ Demande de retour',
        message: `Retour demandé sur commande #${orderId.slice(0, 8)}`,
        metadata: { order_id: orderId },
        created_at: new Date().toISOString(),
      }).catch(() => {});

      return json(Array.isArray(returnReq) ? returnReq[0] : returnReq, 201);
    }

    // PATCH — actions vendeur (approve / reject / received)
    if (request.method === 'PATCH') {
      const url    = new URL(request.url);
      const id     = url.searchParams.get('id');
      const action = url.searchParams.get('action'); // approve | reject | received
      if (!id) return err('id requis', 400);

      const body = await request.json().catch(() => ({}));
      const returns = await sb.from('return_requests').select('*', `id=eq.${id}&vendor_id=eq.${user.id}`);
      if (!returns?.length) return err('Retour introuvable', 404);
      const ret = returns[0];

      if (action === 'approve') {
        await sb.from('return_requests').update({
          status: 'approved', return_instructions: body.instructions || 'Envoyez le colis à l\'adresse indiquée.',
          return_address: body.address || null, approved_at: new Date().toISOString(),
        }, `id=eq.${id}`);

        await sb.from('notifications').insert({
          user_id: ret.buyer_id, type: 'return_approved', title: '✅ Retour approuvé',
          message: 'Votre demande de retour a été approuvée.',
          metadata: { return_id: id, instructions: body.instructions },
          created_at: new Date().toISOString(),
        }).catch(() => {});
      } else if (action === 'reject') {
        await sb.from('return_requests').update({ status: 'rejected', rejection_reason: body.reason || null }, `id=eq.${id}`);
        await sb.from('notifications').insert({
          user_id: ret.buyer_id, type: 'return_rejected', title: '❌ Retour refusé',
          message: body.reason || 'Votre demande de retour a été refusée.',
          metadata: { return_id: id }, created_at: new Date().toISOString(),
        }).catch(() => {});
      } else if (action === 'received') {
        await sb.from('return_requests').update({
          status: 'received', condition_ok: body.conditionOk !== false,
          vendor_notes: body.notes || null, received_at: new Date().toISOString(),
        }, `id=eq.${id}`);

        if (body.conditionOk !== false) {
          // Créer remboursement automatique
          await sb.from('return_requests').update({ refund_status: 'pending' }, `id=eq.${id}`);
          await sb.from('notifications').insert({
            user_id: ret.buyer_id, type: 'refund_initiated', title: '💰 Remboursement en cours',
            message: `Votre remboursement de ${(ret.order_total || 0).toLocaleString()} FCFA est en cours.`,
            metadata: { return_id: id }, created_at: new Date().toISOString(),
          }).catch(() => {});
        }
      } else {
        return err('Action invalide: approve | reject | received', 400);
      }

      return json({ ok: true, action });
    }

    return err('Méthode non supportée', 405);
  } catch (e) { return err(e.message, e.status || 500); }
}
