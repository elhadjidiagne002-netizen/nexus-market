import { CORS, options, json, err, supabase, requireAuth, sendEmail } from '../../../_lib/utils.js';

export async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') return options();
  const sb = supabase(env);
  try {
    const [user, e] = await requireAuth(request, env);
    if (e) return e;
    const u = new URL(request.url);

    if (request.method === 'GET') {
      const page  = parseInt(u.searchParams.get('page')  || '1');
      const limit = parseInt(u.searchParams.get('limit') || '20');
      const offset = (page - 1) * limit;
      let qs = `order=created_at.desc&limit=${limit}&offset=${offset}`;
      if (user.role === 'admin') { /* tout */ }
      else if (user.role === 'vendor') qs += `&vendor_id=eq.${user.id}`;
      else qs += `&buyer_id=eq.${user.id}`;
      const status = u.searchParams.get('status');
      if (status) qs += `&status=eq.${status}`;
      const data = await sb.from('orders').select('*', qs);
      return json(data || []);
    }

    if (request.method === 'POST') {
      const body = await request.json();
      const order = {
        buyer_id: user.id,
        buyer_name: body.buyerName || user.name,
        buyer_email: body.buyerEmail || user.email,
        buyer_address: body.buyerAddress,
        vendor_id: body.vendorId || body.vendor,
        vendor_name: body.vendorName,
        products: body.products || [],
        subtotal: body.subtotal || body.total,
        total: body.total,
        commission: body.commission || (body.total * (parseFloat(env.NEXUS_COMMISSION) || 0.15)),
        discount: body.discount || 0,
        coupon_code: body.couponCode,
        status: 'processing',
        payment_method: body.paymentMethod || 'unknown',
        shipping_city: body.shippingCity,
      };
      const data = await sb.from('orders').insert(order);
      const saved = Array.isArray(data) ? data[0] : data;

      // Créditer les points fidélité
      if (saved?.id) {
        const points = Math.floor(saved.total * 10);
        await sb.rpc('add_loyalty_points', {
          p_user_id: user.id, p_delta: points, p_reason: 'order', p_order_id: saved.id,
          p_note: \`Commande \${saved.id}\`,
        }).catch(() => {});
        // Notifier acheteur
        await sb.from('notifications').insert({
          user_id: user.id, type: 'success', title: 'Commande confirmée',
          message: \`Commande #\${saved.id.slice(0,8)} reçue. Vous gagnez \${points} points fidélité.\`,
        }).catch(() => {});
        // Notifier vendeur
        if (saved.vendor_id) {
          await sb.from('notifications').insert({
            user_id: saved.vendor_id, type: 'info', title: 'Nouvelle commande',
            message: \`Nouvelle commande de \${saved.buyer_name} — \${saved.total} EUR\`,
          }).catch(() => {});
        }
      }
      return json(saved, 201);
    }
    return err('Méthode non supportée', 405);
  } catch (e) { return err(e.message, e.status || 500); }
}
