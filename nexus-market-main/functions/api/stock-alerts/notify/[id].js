import { CORS, options, json, err, supabase, requireAdmin } from '../../_lib/utils.js';

export async function onRequest({ request, env, params }) {
  if (request.method === 'OPTIONS') return options();
  if (request.method !== 'POST') return err('POST requis', 405);
  try {
    const [admin, e] = await requireAdmin(request, env);
    if (e) return e;
    const sb = supabase(env);
    const products = await sb.from('products').select('name,stock', `id=eq.${params.id}`);
    if (!products?.length) return err('Produit introuvable', 404);
    const product = products[0];
    if (product.stock <= 0) return err('Produit toujours en rupture', 400);
    const alerts = await sb.from('stock_alerts').select('user_id', `product_id=eq.${params.id}&notified=eq.false`);
    if (!alerts?.length) return json({ notified: 0 });
    const notifs = alerts.map(a => ({
      user_id: a.user_id, type: 'success', title: 'Produit disponible',
      message: `"${product.name}" est de nouveau en stock !`,
      link: `/products/${params.id}`,
    }));
    await sb.from('notifications').insert(notifs);
    await sb.from('stock_alerts').update({ notified: true }, `product_id=eq.${params.id}&notified=eq.false`);
    return json({ notified: alerts.length });
  } catch (e) { return err(e.message, e.status || 500); }
}


