import { CORS, options, json, err, supabase, requireAuth } from '../../../_lib/utils.js';

export async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') return options();
  const sb = supabase(env);
  const u = new URL(request.url);

  try {
    if (request.method === 'GET') {
      const cat      = u.searchParams.get('category');
      const q        = u.searchParams.get('q');
      const vendorId = u.searchParams.get('vendorId');
      const page     = parseInt(u.searchParams.get('page') || '1');
      const limit    = parseInt(u.searchParams.get('limit') || '24');
      const offset   = (page - 1) * limit;

      let qs = `select=*&order=created_at.desc&limit=${limit}&offset=${offset}`;
      if (cat)      qs += `&category=eq.${encodeURIComponent(cat)}`;
      if (vendorId) qs += `&vendor_id=eq.${vendorId}`;
      // Admin/vendor peut voir non-modérés; public voit uniquement active+moderated
      const auth = request.headers.get('Authorization');
      if (!auth) qs += `&active=eq.true&moderated=eq.true`;
      if (q) qs += `&name=ilike.*${encodeURIComponent(q)}*`;

      const data = await sb.from('products').select('*', qs.replace('select=*&', ''));
      return json(data || []);
    }

    if (request.method === 'POST') {
      const [user, e] = await requireAuth(request, env);
      if (e) return e;
      const body = await request.json();
      const product = {
        ...body,
        vendor_id: user.id,
        vendor_name: body.vendorName || user.name,
        active: body.active ?? true,
        moderated: false,
        rating: 0,
        reviews_count: 0,
        sold_count: 0,
      };
      delete product.id;
      const data = await sb.from('products').insert(product);
      return json(Array.isArray(data) ? data[0] : data, 201);
    }

    return err('Méthode non supportée', 405);
  } catch (e) { return err(e.message, e.status || 500); }
}









