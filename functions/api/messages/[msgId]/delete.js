import { CORS, options, json, err, supabase, requireAuth } from '../_lib/utils.js';

export async function onRequest({ request, env, params }) {
  if (request.method === 'OPTIONS') return options();
  if (request.method !== 'DELETE' && request.method !== 'POST') return err('DELETE requis', 405);
  try {
    const [user, e] = await requireAuth(request, env);
    if (e) return e;
    const sb = supabase(env);
    await sb.from('messages').update({ deleted: true }, `id=eq.${params.msgId}&from_id=eq.${user.id}`);
    return json({ success: true });
  } catch (e) { return err(e.message, 500); }
}










