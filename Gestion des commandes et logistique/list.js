import { CORS, options, json, err, supabase, requireAuth } from '../../../_lib/utils.js';

export async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') return options();

  try {
    const { user, error: authError } = await requireAuth(request, env);
    if (authError) return err(authError.message, authError.status);

    const { status, limit = 10, offset = 0 } = new URL(request.url).searchParams;
    const sb = supabase(env);

    // 1. Récupérer les commandes de l'utilisateur (client OU vendeur)
    const { data: orders, error, count } = await sb
      .from('orders')
      .select(`
        *,
        order_items(*,
          products:product_id(id, name, images)
        ),
        vendor:vendor_id(id, name, email),
        user:user_id(id, name, email)
      `)
      .or(`user_id.eq.${user.id},vendor_id.eq.${user.id}`)
      .eq('status', status || 'pending')
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;

    return json({
      success: true,
      orders: orders,
      total: count
    });

  } catch (error) {
    return err(error.message, 500);
  }
}