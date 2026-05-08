import { CORS, options, json, err, supabase, requireAuth } from '../_lib/utils.js';

export async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') return options();
  if (request.method !== 'POST') return err('POST requis', 405);
  try {
    const [user, e] = await requireAuth(request, env);
    if (e) return e;
    const { productIds } = await request.json();
    if (!Array.isArray(productIds) || !productIds.length) return json({ migrated: 0 });
    const sb = supabase(env);
    const rows = productIds.map(pid => ({ user_id: user.id, product_id: pid, notified: false }));
    await sb.from('stock_alerts').upsert(rows, 'user_id,product_id');
    return json({ migrated: rows.length });
  } catch (e) { return err(e.message, 500); }
}











