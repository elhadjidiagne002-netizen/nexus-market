import { CORS, options, json, err, supabase, requireAuth } from '../../_lib/utils.js';

export async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') return options();
  try {
    const [user, e] = await requireAuth(request, env);
    if (e) return e;
    const sb = supabase(env);
    const data = await sb.from('messages').select('id', `to_id=eq.${user.id}&read=eq.false&deleted=eq.false`);
    return json({ count: (data || []).length });
  } catch (e) { return err(e.message, 500); }
}


