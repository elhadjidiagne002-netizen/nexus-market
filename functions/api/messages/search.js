import { CORS, options, json, err, supabase, requireAuth } from '';

export async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') return options();
  try {
    const [user, e] = await requireAuth(request, env);
    if (e) return e;
    const q = new URL(request.url).searchParams.get('q') || '';
    if (!q) return json([]);
    const sb = supabase(env);
    const data = await sb.from('messages').select('*', `or=(from_id.eq.${user.id},to_id.eq.${user.id})&text=ilike.*${encodeURIComponent(q)}*&deleted=eq.false&limit=20`);
    return json(data || []);
  } catch (e) { return err(e.message, 500); }
}





