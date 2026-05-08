import { CORS, options, json, err, supabase, requireAuth } from '../../../../_lib/utils.js';

export async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') return options();
  try {
    const [user, e] = await requireAuth(request, env);
    if (e) return e;
    const u = new URL(request.url);
    const q = u.searchParams.get('q') || '';
    const limit = parseInt(u.searchParams.get('limit') || '8');
    if (q.length < 2) return json([]);
    const sb = supabase(env);
    const data = await sb.from('profiles').select('id,name,email,role,avatar,shop_name', \`or=(name.ilike.*\${q}*,email.ilike.*\${q}*)&limit=\${limit}\`);
    return json(data || []);
  } catch (e) { return err(e.message, 500); }
}
