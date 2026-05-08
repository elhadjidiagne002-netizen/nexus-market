import { CORS, options, json, err, supabase, requireAuth, requireAdmin } from '../../../_lib/utils.js';

export async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') return options();
  const sb = supabase(env);
  try {
    if (request.method === 'GET') {
      const [user, e] = await requireAuth(request, env);
      if (e) return e;
      const qs = user.role === 'admin' ? 'order=created_at.desc' : 'active=eq.true&order=created_at.desc';
      return json(await sb.from('coupons').select('*', qs) || []);
    }
    if (request.method === 'POST') {
      const [admin, e] = await requireAdmin(request, env);
      if (e) return e;
      const body = await request.json();
      if (!body.code || !body.discount) return err('code et discount requis', 400);
      body.code = body.code.toUpperCase().trim();
      const data = await sb.from('coupons').insert({ ...body, used_count: 0, created_by: admin.id });
      return json(Array.isArray(data) ? data[0] : data, 201);
    }
    return err('Méthode non supportée', 405);
  } catch (e) { return err(e.message, e.status || 500); }
}









