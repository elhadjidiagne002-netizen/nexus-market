import { CORS, options, json, err, supabase, requireAdmin } from '../../_lib/utils.js';

export async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') return options();
  const sb = supabase(env);
  try {
    if (request.method === 'GET') {
      const now = new Date().toISOString();
      const data = await sb.from('flash_sales').select('*', `active=eq.true&ends_at=gt.${now}&order=ends_at.asc`);
      return json(data || []);
    }
    const [admin, e] = await requireAdmin(request, env);
    if (e) return e;
    if (request.method === 'POST') {
      const body = await request.json();
      const data = await sb.from('flash_sales').insert({ product_id: body.productId, discount: body.discount, ends_at: body.endsAt, active: true });
      return json(Array.isArray(data) ? data[0] : data, 201);
    }
    return err('Méthode non supportée', 405);
  } catch (e) { return err(e.message, e.status || 500); }
}



