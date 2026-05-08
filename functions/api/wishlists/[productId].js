import { CORS, options, json, err, supabase, requireAuth } from '../../_lib/utils.js';

export async function onRequest({ request, env, params }) {
  if (request.method === 'OPTIONS') return options();
  if (request.method !== 'DELETE') return err('DELETE requis', 405);
  try {
    const [user, e] = await requireAuth(request, env);
    if (e) return e;
    const sb = supabase(env);
    await sb.from('wishlists').delete(`user_id=eq.${user.id}&product_id=eq.${params.productId}`);
    return json({ success: true });
  } catch (e) { return err(e.message, 500); }
}

