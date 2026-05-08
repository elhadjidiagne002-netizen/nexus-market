import { CORS, options, json, err, supabase, requireAuth } from '../../_lib/utils.js';

export async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') return options();
  const sb = supabase(env);
  try {
    const [user, e] = await requireAuth(request, env);
    if (e) return e;
    if (request.method === 'GET') {
      const qs = user.role === 'vendor'
        ? `vendor_id=eq.${user.id}&order=created_at.desc`
        : `buyer_id=eq.${user.id}&order=created_at.desc`;
      return json(await sb.from('offers').select('*', qs) || []);
    }
    if (request.method === 'POST') {
      const body = await request.json();
      const data = await sb.from('offers').insert({
        product_id: body.productId, product_name: body.productName,
        buyer_id: user.id, buyer_name: user.name || user.email,
        vendor_id: body.vendorId, offered_price: body.offeredPrice,
        message: body.message, status: 'pending',
      });
      const saved = Array.isArray(data) ? data[0] : data;
      // Notifier le vendeur
      if (body.vendorId) {
        await sb.from('notifications').insert({
          user_id: body.vendorId, type: 'info', title: 'Nouvelle offre',
          message: `${user.name || 'Un acheteur'} propose ${body.offeredPrice} EUR pour "${body.productName}"`,
        }).catch(() => {});
      }
      return json(saved, 201);
    }
    return err('Méthode non supportée', 405);
  } catch (e) { return err(e.message, e.status || 500); }
}


