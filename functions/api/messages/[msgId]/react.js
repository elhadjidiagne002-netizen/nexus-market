import { CORS, options, json, err, supabase, requireAuth } from '../../../../../_lib/utils.js';

export async function onRequest({ request, env, params }) {
  if (request.method === 'OPTIONS') return options();
  if (request.method !== 'POST') return err('POST requis', 405);
  try {
    const [user, e] = await requireAuth(request, env);
    if (e) return e;
    const { emoji } = await request.json();
    const sb = supabase(env);
    const msgs = await sb.from('messages').select('reactions', `id=eq.${params.msgId}`);
    if (!msgs?.length) return err('Message introuvable', 404);
    const reactions = msgs[0].reactions || {};
    if (!reactions[emoji]) reactions[emoji] = [];
    const idx = reactions[emoji].indexOf(user.id);
    if (idx >= 0) reactions[emoji].splice(idx, 1);
    else reactions[emoji].push(user.id);
    if (!reactions[emoji].length) delete reactions[emoji];
    await sb.from('messages').update({ reactions }, `id=eq.${params.msgId}`);
    return json({ reactions });
  } catch (e) { return err(e.message, 500); }
}
