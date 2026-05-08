import { CORS, options, json, err, supabase, requireAuth } from '../_lib/utils.js';

export async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') return options();
  if (request.method !== 'POST') return err('POST requis', 405);
  try {
    const [user, e] = await requireAuth(request, env);
    if (e) return e;
    const { orderId } = await request.json();
    const sb = supabase(env);
    const orders = await sb.from('orders').select('*', `id=eq.${orderId}`);
    if (!orders?.length) return err('Commande introuvable', 404);
    const order = orders[0];
    // Regrouper les produits par vendeur
    const byVendor = {};
    for (const p of (order.products || [])) {
      const vid = p.vendor_id || p.vendorId;
      if (!byVendor[vid]) byVendor[vid] = { vendorId: vid, vendorName: p.vendorName, products: [], total: 0 };
      byVendor[vid].products.push(p);
      byVendor[vid].total += (p.price || 0) * (p.qty || 1);
    }
    const subOrders = [];
    for (const [vid, sub] of Object.entries(byVendor)) {
      const commission = parseFloat(env.NEXUS_COMMISSION) || 0.15;
      const row = {
        buyer_id: order.buyer_id, buyer_name: order.buyer_name, buyer_email: order.buyer_email,
        vendor_id: vid, vendor_name: sub.vendorName, products: sub.products,
        subtotal: sub.total, total: sub.total, commission: sub.total * commission,
        status: order.status, payment_method: order.payment_method,
      };
      const created = await sb.from('orders').insert(row);
      subOrders.push(Array.isArray(created) ? created[0] : created);
    }
    // Annuler l'ordre original
    await sb.from('orders').update({ status: 'cancelled' }, `id=eq.${orderId}`);
    return json({ success: true, subOrders });
  } catch (e) { return err(e.message, e.status || 500); }
}











