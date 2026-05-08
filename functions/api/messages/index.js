import { CORS, options, json, err, supabase, requireAuth } from '../../../_lib/utils.js';

export async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') return options();
  try {
    const [user, e] = await requireAuth(request, env);
    if (e) return e;
    const sb = supabase(env);
    const u = new URL(request.url);

    if (request.method === 'GET') {
      const withUser = u.searchParams.get('with');
      let qs = `or=(from_id.eq.${user.id},to_id.eq.${user.id})&deleted=eq.false&order=created_at.asc`;
      if (withUser) qs = `or=(and(from_id.eq.${user.id},to_id.eq.${withUser}),and(from_id.eq.${withUser},to_id.eq.${user.id}))&deleted=eq.false&order=created_at.asc`;
      const data = await sb.from('messages').select('*', qs);
      return json(data || []);
    }

    if (request.method === 'POST') {
      const body = await request.json();
      const msg = {
        from_id: user.id, from_name: body.fromName || user.name,
        to_id: body.toId, to_name: body.toName,
        text: body.text || '', read: false, deleted: false,
        reply_to_id: body.replyToId || null, reply_to_text: body.replyToText || null,
        attachments: body.attachments || [], reactions: {},
      };
      const data = await sb.from('messages').insert(msg);
      const saved = Array.isArray(data) ? data[0] : data;
      // Notifier le destinataire
      await sb.from('notifications').insert({
        user_id: body.toId, type: 'info', title: `Message de ${user.name || 'quelqu\'un'}`,
        message: (body.text || '').slice(0, 80),
      }).catch(() => {});
      return json(saved, 201);
    }
    return err('Méthode non supportée', 405);
  } catch (e) { return err(e.message, e.status || 500); }
}
