// functions/api/disputes/index.js — Feature 20 : Litiges (workflow complet)
// GET  /api/disputes              → mes litiges (buyer/vendor) ou tous (admin)
// POST /api/disputes              → ouvrir un litige
import { options, json, err, supabase, requireAuth, requireAdmin, sendEmail } from '../_lib/utils.js';

const REASONS = ['not_received','not_as_described','defective','wrong_item','unauthorized','other'];

export async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') return options();
  const sb = supabase(env);

  try {
    if (request.method === 'GET') {
      const [user, e] = await requireAuth(request, env);
      if (e) return e;

      const filter = user.role === 'admin'
        ? 'order=created_at.desc'
        : `or=(buyer_id.eq.${user.id},vendor_id.eq.${user.id})&order=created_at.desc`;

      const url    = new URL(request.url);
      const status = url.searchParams.get('status');
      const qs     = status ? `${filter}&status=eq.${status}` : filter;
      const data   = await sb.from('disputes').select('*', qs + '&limit=50');
      return json(data || []);
    }

    if (request.method === 'POST') {
      const [user, e] = await requireAuth(request, env);
      if (e) return e;

      const body = await request.json().catch(() => ({}));
      const { orderId, vendorId, vendorName, reason, description, evidenceUrls } = body;

      if (!orderId || !reason || !description) return err('orderId, reason et description requis', 400);
      if (!REASONS.includes(reason)) return err(`Raison invalide. Valeurs: ${REASONS.join(', ')}`, 400);
      if (description.length < 20) return err('Description trop courte (min 20 caractères)', 400);

      // Vérifier la commande
      const orders = await sb.from('orders').select('id,status,total,vendor_id', `id=eq.${orderId}&buyer_id=eq.${user.id}`);
      if (!orders?.length) return err('Commande introuvable', 404);
      const order = orders[0];

      if (!['delivered','shipped','completed'].includes(order.status)) {
        return err('Litige possible uniquement pour les commandes expédiées ou livrées', 400);
      }

      // Vérifier doublon
      const existing = await sb.from('disputes').select('id', `order_id=eq.${orderId}&status=in.(open,in_review,escalated)`);
      if (existing?.length) return err('Un litige est déjà ouvert sur cette commande', 409);

      const dispute = await sb.from('disputes').insert({
        order_id:        orderId,
        buyer_id:        user.id,
        buyer_name:      user.name || user.email,
        vendor_id:       vendorId || order.vendor_id,
        vendor_name:     vendorName || '',
        reason, description,
        evidence_urls:   evidenceUrls || [],
        status:          'open',
        amount_disputed: order.total,
        deadline_vendor: new Date(Date.now() + 72 * 3600000).toISOString(),
        created_at:      new Date().toISOString(),
      });

      // Notification email vendeur
      if (vendorId || order.vendor_id) {
        const vendors = await sb.from('profiles').select('email,name', `id=eq.${vendorId || order.vendor_id}`).catch(() => []);
        if (vendors?.[0]?.email) {
          await sendEmail(env, {
            to: vendors[0].email,
            subject: `⚠️ Nouveau litige — Commande #${orderId.slice(0, 8)}`,
            html: `<p>Un litige a été ouvert sur la commande <strong>#${orderId.slice(0, 8)}</strong>.</p>
                   <p><strong>Raison :</strong> ${reason}</p>
                   <p><strong>Description :</strong> ${description}</p>
                   <p>Vous avez <strong>72h</strong> pour répondre.</p>`,
          });
        }
      }

      // Notification Supabase
      await sb.from('notifications').insert({
        user_id: vendorId || order.vendor_id,
        type: 'dispute_opened', title: '⚠️ Nouveau litige',
        message: `Litige sur commande #${orderId.slice(0, 8)} — ${reason}`,
        metadata: { dispute_id: Array.isArray(dispute) ? dispute[0]?.id : dispute?.id, order_id: orderId },
        created_at: new Date().toISOString(),
      }).catch(() => {});

      return json(Array.isArray(dispute) ? dispute[0] : dispute, 201);
    }

    return err('Méthode non supportée', 405);
  } catch (e) { return err(e.message, e.status || 500); }
}
