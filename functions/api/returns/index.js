import { CORS, options, json, err, supabase, requireAuth } from '../../_lib/utils.js';

export async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') return options();
  const sb = supabase(env);
  try {
    const [user, e] = await requireAuth(request, env);
    if (e) return e;
    if (request.method === 'GET') {
      const qs = user.role === 'admin' ? 'order=created_at.desc'
        : user.role === 'vendor' ? `vendor_id=eq.${user.id}&order=created_at.desc`
        : `buyer_id=eq.${user.id}&order=created_at.desc`;
      return json(await sb.from('return_requests').select('*', qs) || []);
    }
    if (request.method === 'POST') {
      const body = await request.json();
      const data = await sb.from('return_requests').insert({
        order_id: body.orderId, buyer_id: user.id, buyer_name: user.name || user.email,
        buyer_email: user.email, vendor_id: body.vendorId, vendor_name: body.vendorName,
        products: body.products || [], order_total: body.orderTotal || 0,
        category: body.category, category_label: body.categoryLabel,
        description: body.description, status: 'pending',
      });
      return json(Array.isArray(data) ? data[0] : data, 201);
    }
    return err('Méthode non supportée', 405);
  } catch (e) { return err(e.message, e.status || 500); }
}


