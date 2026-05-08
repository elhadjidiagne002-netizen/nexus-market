import { CORS, options, json, err, supabase, requireAuth, sendEmail } from '../../_lib/utils.js';

export async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') return options();

  const sb = supabase(env);

  try {
    // Authentification
    const [user, authError] = await requireAuth(request, env);
    if (authError) return authError;

    const url = new URL(request.url);

    // GET: Récupérer les commandes
    if (request.method === 'GET') {
      const page = parseInt(url.searchParams.get('page') || '1');
      const limit = parseInt(url.searchParams.get('limit') || '20');
      const offset = (page - 1) * limit;
      const status = url.searchParams.get('status');

      // Construction de la requête Supabase
      let query = sb
        .from('orders')
        .select('*')
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      // Filtres selon le rôle de l'utilisateur
      if (user.role !== 'admin') {
        if (user.role === 'vendor') {
          query = query.eq('vendor_id', user.id);
        } else {
          query = query.eq('buyer_id', user.id);
        }
      }

      // Filtre par statut si spécifié
      if (status) {
        query = query.eq('status', status);
      }

      const { data, error } = await query;
      if (error) throw error;
      return json(data || []);
    }

    // POST: Créer une nouvelle commande
    if (request.method === 'POST') {
      const body = await request.json();
      const commissionRate = parseFloat(env.NEXUS_COMMISSION) || 0.15;

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
        commission: body.commission || (body.total * commissionRate),
        discount: body.discount || 0,
        coupon_code: body.couponCode,
        status: 'processing',
        payment_method: body.paymentMethod || 'unknown',
        shipping_city: body.shippingCity,
        created_at: new Date().toISOString(),
      };

      // Insertion de la commande
      const { data: saved, error } = await sb
        .from('orders')
        .insert(order)
        .select()
        .single();

      if (error) throw error;

      // Créditer les points fidélité
      if (saved?.id) {
        const points = Math.floor(saved.total * 10);

        // Utilisation de RPC pour ajouter des points
        await sb
          .rpc('add_loyalty_points', {
            p_user_id: user.id,
            p_delta: points,
            p_reason: 'order',
            p_order_id: saved.id,
            p_note: `Commande ${saved.id}`,
          })
          .catch(() => {});

        // Notification à l'acheteur
        await sb
          .from('notifications')
          .insert({
            user_id: user.id,
            type: 'success',
            title: 'Commande confirmée',
            message: `Commande #${saved.id.slice(0, 8)} reçue. Vous gagnez ${points} points fidélité.`,
          })
          .catch(() => {});

        // Notification au vendeur
        if (saved.vendor_id) {
          await sb
            .from('notifications')
            .insert({
              user_id: saved.vendor_id,
              type: 'info',
              title: 'Nouvelle commande',
              message: `Nouvelle commande de ${saved.buyer_name} — ${saved.total} EUR`,
            })
            .catch(() => {});
        }
      }

      return json(saved, 201);
    }

    return err('Méthode non supportée', 405);
  } catch (error) {
    return err(error.message, error.status || 500);
  }
}


