// functions/api/disputes/[id].js — Actions sur un litige
// GET  /api/disputes/:id              → détail + messages
// POST /api/disputes/:id/message      → ajouter un message
// POST /api/disputes/:id/resolve      → résoudre (admin)
// POST /api/disputes/:id/close        → fermer (acheteur)
import { options, json, err, supabase, requireAuth, requireAdmin, sendEmail } from '../../_lib/utils.js';

const RESOLUTIONS = ['refund_full','refund_partial','replacement','no_action','dismissed'];

export async function onRequest({ request, env, params }) {
  if (request.method === 'OPTIONS') return options();
  const sb = supabase(env);
  const id = params?.id;
  if (!id) return err('ID manquant', 400);

  try {
    const [user, e] = await requireAuth(request, env);
    if (e) return e;

    const url    = new URL(request.url);
    const action = url.searchParams.get('action'); // message | resolve | close

    // GET — détail + messages
    if (request.method === 'GET') {
      const filter = user.role === 'admin'
        ? `id=eq.${id}`
        : `id=eq.${id}&or=(buyer_id.eq.${user.id},vendor_id.eq.${user.id})`;

      const disputes = await sb.from('disputes').select('*', filter);
      if (!disputes?.length) return err('Litige introuvable', 404);

      const messages = await sb.from('dispute_messages').select('*', `dispute_id=eq.${id}&order=created_at.asc`).catch(() => []);

      return json({ dispute: disputes[0], messages: messages || [] });
    }

    // POST — actions
    if (request.method === 'POST') {
      const body = await request.json().catch(() => ({}));

      // ── Ajouter un message ──────────────────────────────────────
      if (action === 'message' || body.action === 'message') {
        const { content, attachments } = body;
        if (!content?.trim()) return err('Contenu requis', 400);

        // Vérifier accès
        const disputes = await sb.from('disputes').select('id,status,buyer_id,vendor_id', `id=eq.${id}&or=(buyer_id.eq.${user.id},vendor_id.eq.${user.id})`);
        if (!disputes?.length) return err('Litige introuvable', 404);
        const dispute = disputes[0];
        if (['resolved','closed'].includes(dispute.status)) return err('Litige fermé — impossible d\'ajouter un message', 400);

        const senderRole = dispute.buyer_id === user.id ? 'buyer' : user.role === 'admin' ? 'admin' : 'vendor';
        const msg = await sb.from('dispute_messages').insert({
          dispute_id: id, sender_id: user.id, sender_role: senderRole,
          content: content.trim(), attachments: attachments || [],
          created_at: new Date().toISOString(),
        });

        // Notifier l'autre partie
        const recipientId = senderRole === 'buyer' ? dispute.vendor_id : dispute.buyer_id;
        await sb.from('notifications').insert({
          user_id: recipientId, type: 'dispute_message',
          title: '💬 Nouveau message dans votre litige',
          message: content.slice(0, 100),
          metadata: { dispute_id: id },
          created_at: new Date().toISOString(),
        }).catch(() => {});

        return json(Array.isArray(msg) ? msg[0] : msg, 201);
      }

      // ── Résoudre (admin) ──────────────────────────────────────
      if (action === 'resolve' || body.action === 'resolve') {
        if (user.role !== 'admin') return err('Accès admin requis', 403);
        const { resolution, refundAmount, note } = body;
        if (!resolution || !RESOLUTIONS.includes(resolution)) return err(`Résolution invalide: ${RESOLUTIONS.join(', ')}`, 400);

        const disputes = await sb.from('disputes').select('id,buyer_id,vendor_id,order_id,amount_disputed', `id=eq.${id}`);
        if (!disputes?.length) return err('Litige introuvable', 404);
        const dispute = disputes[0];

        await sb.from('disputes').update({
          status: 'resolved', resolution,
          refund_amount: refundAmount || null,
          admin_note: note || null,
          resolved_by: user.id,
          resolved_at: new Date().toISOString(),
        }, `id=eq.${id}`);

        // Créer remboursement si applicable
        if (['refund_full','refund_partial'].includes(resolution)) {
          const amount = resolution === 'refund_full' ? dispute.amount_disputed : (refundAmount || 0);
          await sb.from('return_requests').insert({
            order_id: dispute.order_id, buyer_id: dispute.buyer_id,
            vendor_id: dispute.vendor_id, dispute_id: id,
            category: 'dispute_resolution', order_total: amount,
            description: `Litige résolu: ${resolution}`, status: 'approved',
            created_at: new Date().toISOString(),
          }).catch(() => {});
        }

        // Notifier les deux parties
        const label = { refund_full: 'Remboursement intégral accordé', refund_partial: 'Remboursement partiel accordé', replacement: 'Remplacement demandé', no_action: 'Clôturé sans action', dismissed: 'Litige rejeté' }[resolution];
        for (const uid of [dispute.buyer_id, dispute.vendor_id]) {
          await sb.from('notifications').insert({
            user_id: uid, type: 'dispute_resolved', title: '⚖️ Litige résolu',
            message: label, metadata: { dispute_id: id },
            created_at: new Date().toISOString(),
          }).catch(() => {});
        }

        return json({ ok: true, resolution, refund_amount: refundAmount });
      }

      // ── Fermer (acheteur) ──────────────────────────────────────
      if (action === 'close' || body.action === 'close') {
        const disputes = await sb.from('disputes').select('id,vendor_id,status', `id=eq.${id}&buyer_id=eq.${user.id}&status=in.(open,in_review)`);
        if (!disputes?.length) return err('Litige introuvable ou non modifiable', 404);

        await sb.from('disputes').update({
          status: 'closed', resolution: 'withdrawn',
          resolved_at: new Date().toISOString(), close_reason: body.reason || null,
        }, `id=eq.${id}`);

        await sb.from('notifications').insert({
          user_id: disputes[0].vendor_id, type: 'dispute_closed',
          title: '✅ Litige retiré', message: 'L\'acheteur a retiré son litige.',
          metadata: { dispute_id: id }, created_at: new Date().toISOString(),
        }).catch(() => {});

        return json({ ok: true });
      }

      return err('Action non reconnue. Paramètre ?action=message|resolve|close requis', 400);
    }

    return err('Méthode non supportée', 405);
  } catch (e) { return err(e.message, e.status || 500); }
}
