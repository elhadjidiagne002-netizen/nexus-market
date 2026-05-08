import { CORS, options, json, err, supabase, requireAuth } from '../../_lib/utils.js';

export async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') return options();
  const sb = supabase(env);
  const u = new URL(request.url);
  try {
    if (request.method === 'GET') {
      const productId = u.searchParams.get('productId');
      const vendorId  = u.searchParams.get('vendorId');
      let qs = 'order=created_at.desc&limit=50';
      if (productId) qs += `&product_id=eq.${productId}`;
      if (vendorId) {
        const products = await sb.from('products').select('id', `vendor_id=eq.${vendorId}`);
        const ids = (products || []).map(p => p.id).join(',');
        if (!ids) return json([]);
        qs += `&product_id=in.(${ids})`;
      }
      return json(await sb.from('reviews').select('*', qs) || []);
    }
    if (request.method === 'POST') {
      const [user, e] = await requireAuth(request, env);
      if (e) return e;
      const { productId, rating, comment } = await request.json();
      if (!productId || !rating) return err('productId et rating requis', 400);
      if (rating < 1 || rating > 5) return err('Note entre 1 et 5', 400);
      const data = await sb.from('reviews').upsert({
        product_id: productId, user_id: user.id,
        user_name: user.name || user.email, rating, comment: comment || null,
      }, 'user_id,product_id');
      return json(Array.isArray(data) ? data[0] : data, 201);
    }
    return err('Méthode non supportée', 405);
  } catch (e) { return err(e.message, e.status || 500); }
}


