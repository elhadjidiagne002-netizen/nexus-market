import { CORS, options, json, err, supabase, requireAuth } from '../../../_lib/utils.js';

export async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') return options();
  const sb = supabase(env);
  try {
    const [user, e] = await requireAuth(request, env);
    if (e) return e;
    if (request.method === 'GET') {
      const data = await sb.from('carts').select('items', `user_id=eq.${user.id}`);
      return json({ items: data?.[0]?.items || [] });
    }
    if (request.method === 'PUT' || request.method === 'POST') {
      const { items } = await request.json();
      await sb.from('carts').upsert({ user_id: user.id, items: items || [], updated_at: new Date().toISOString() }, 'user_id');
      return json({ success: true, items });
    }
    if (request.method === 'DELETE') {
      await sb.from('carts').upsert({ user_id: user.id, items: [], updated_at: new Date().toISOString() }, 'user_id');
      return json({ success: true });
    }
    return err('Méthode non supportée', 405);
  } catch (e) { return err(e.message, e.status || 500); }
}
