import { CORS, options, json, err, supabase, requireAuth } from '';

export async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') return options();
  if (request.method !== 'POST') return err('POST requis', 405);
  try {
    const [user, e] = await requireAuth(request, env);
    if (e) return e;
    const { items } = await request.json();
    if (!Array.isArray(items)) return err('items doit être un tableau', 400);
    const sb = supabase(env);
    const existing = await sb.from('carts').select('items', `user_id=eq.${user.id}`);
    const currentItems = existing?.[0]?.items || [];
    // Fusionner sans doublons
    const merged = [...currentItems];
    for (const newItem of items) {
      const idx = merged.findIndex(i => i.id === newItem.id);
      if (idx >= 0) merged[idx].qty = (merged[idx].qty || 1) + (newItem.qty || 1);
      else merged.push(newItem);
    }
    await sb.from('carts').upsert({ user_id: user.id, items: merged, updated_at: new Date().toISOString() }, 'user_id');
    return json({ success: true, items: merged });
  } catch (e) { return err(e.message, 500); }
}





