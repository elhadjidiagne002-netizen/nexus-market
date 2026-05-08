import { CORS, options, json, err, supabase, requireAdmin } from '';

export async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') return options();
  try {
    const [admin, e] = await requireAdmin(request, env);
    if (e) return e;
    const sb = supabase(env);
    const u = new URL(request.url);
    const role = u.searchParams.get('role');
    const page = parseInt(u.searchParams.get('page') || '1');
    const limit = parseInt(u.searchParams.get('limit') || '50');
    const offset = (page - 1) * limit;
    let qs = `order=created_at.desc&limit=${limit}&offset=${offset}`;
    if (role) qs += `&role=eq.${role}`;
    const data = await sb.from('profiles').select('*', qs);
    return json(data || []);
  } catch (e) { return err(e.message, e.status || 500); }
}





