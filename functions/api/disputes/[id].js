// Feature 20 : Litiges — actions (message / resolve / close)
import { options, json, err, supabase, requireAuth } from '../../_lib/utils.js';

export async function onRequest({ request, env, params }) {
  if (request.method === 'OPTIONS') return options();
  const sb = supabase(env);
  const id = params?.id;
  if (!id) return err('ID manquant', 400);
  try {
    const [user, e] = await requireAuth(request, env);
    if (e) return e;
    const url    = new URL(request.url);
    const action = url.searchParams.get('action');
    if (request.method === 'GET') {
      const filter = user.role === 'admin' ? `id=eq.${id}`
        : `id=eq.${id}&or=(buyer_id.eq.${user.id},vendor_id.eq.${user.id})`;
      const disputes = await sb.from('disputes').select('*', filter);
      if (!disputes?.length) return err('Litige introuvable', 404);
      const messages = await sb.from('dispute_messages').select('*', `dispute_id=eq.${id}&order=created_at.asc`).catch(() => []);
      return json({ dispute: disputes[0], messages: messages || [] });
    }
    if (request.method === 'POST') {
      const body = await request.json().catch(() => ({}));
      if (action === 'message' || body.action === 'message') {
        if (!body.content?.trim()) return err('Contenu requis', 400);
        const disputes = await sb.from('disputes').select('id,status,buyer_id,vendor_id',
          `id=eq.${id}&or=(buyer_id.eq.${user.id},vendor_id.eq.${user.id})`);
        if (!disputes?.length) return err('Litige introuvable', 404);
        const d = disputes[0];
        if (['resolved','closed'].includes(d.status)) return err('Litige ferme', 400);
        const role = d.buyer_id === user.id ? 'buyer' : user.role === 'admin' ? 'admin' : 'vendor';
        const msg  = await sb.from('dispute_messages').insert({
          dispute_id: id, sender_id: user.id, sender_role: role,
          content: body.content.trim(), attachments: body.attachments || [],
          created_at: new Date().toISOString(),
        });
        await sb.from('notifications').insert({
          user_id: role === 'buyer' ? d.vendor_id : d.buyer_id,
          type: 'dispute_message', title: 'Message litige',
          message: body.content.slice(0,100), metadata: { dispute_id: id },
          created_at: new Date().toISOString(),
        }).catch(() => {});
        return json(Array.isArray(msg) ? msg[0] : msg, 201);
      }
      if (action === 'resolve' || body.action === 'resolve') {
        if (user.role !== 'admin') return err('Acces admin requis', 403);
        const { resolution, refundAmount, note } = body;
        const RESOLUTIONS = ['refund_full','refund_partial','replacement','no_action','dismissed'];
        if (!RESOLUTIONS.includes(resolution)) return err(`Resolution invalide: ${RESOLUTIONS.join(',')}`, 400);
        const disputes = await sb.from('disputes').select('id,buyer_id,vendor_id', `id=eq.${id}`);
        if (!disputes?.length) return err('Litige introuvable', 404);
        const d = disputes[0];
        await sb.from('disputes').update({ status: 'resolved', resolution,
          refund_amount: refundAmount || null, admin_note: note || null,
          resolved_by: user.id, resolved_at: new Date().toISOString() }, `id=eq.${id}`);
        for (const uid of [d.buyer_id, d.vendor_id]) {
          await sb.from('notifications').insert({
            user_id: uid, type: 'dispute_resolved', title: 'Litige resolu',
            message: resolution, metadata: { dispute_id: id }, created_at: new Date().toISOString(),
          }).catch(() => {});
        }
        return json({ ok: true, resolution });
      }
      if (action === 'close' || body.action === 'close') {
        const disputes = await sb.from('disputes').select('id,vendor_id,status',
          `id=eq.${id}&buyer_id=eq.${user.id}&status=in.(open,in_review)`);
        if (!disputes?.length) return err('Litige introuvable ou non modifiable', 404);
        await sb.from('disputes').update({ status: 'closed', resolution: 'withdrawn',
          resolved_at: new Date().toISOString() }, `id=eq.${id}`);
        return json({ ok: true });
      }
      return err('?action=message|resolve|close requis', 400);
    }
    return err('Methode non supportee', 405);
  } catch (e) { return err(e.message, e.status || 500); }
}