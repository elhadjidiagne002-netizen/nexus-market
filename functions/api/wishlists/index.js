import { CORS, options, json, err, supabase, requireAuth } from '../../../_lib/utils.js';

export async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') return options();
  try {
    const [user, e] = await requireAuth(request, env);
    if (e) return e;
    const sb = supabase(env);
    if (request.method === 'GET') {
      const data = await sb.from('wishlists').select('product_id', `user_id=eq.${user.id}`);
      return json(data || []);
    }
    if (request.method === 'POST') {
      const { productId } = await request.json();
      if (!productId) return err('productId requis', 400);
      await sb.from('wishlists').insert({ user_id: user.id, product_id: productId });
      return json({ success: true }, 201);
    }
    return err('Méthode non supportée', 405);
  } catch (e) { return err(e.message, e.status || 500); }
}
