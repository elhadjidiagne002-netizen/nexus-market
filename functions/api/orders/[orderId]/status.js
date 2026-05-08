<<<<<<< HEAD
import { CORS, options, json, err, supabase, requireAuth } from '../../_lib/utils.js';
=======
import { CORS, options, json, err, supabase, requireAuth } from '../../../../../_lib/utils.js';
>>>>>>> de181290f9e31c8efdacd3a0be8e832d7245e20c

export async function onRequest({ request, env, params }) {
  if (request.method === 'OPTIONS') return options();
  if (request.method !== 'POST') return err('POST requis', 405);

  try {
    const [user, authError] = await requireAuth(request, env);
    if (authError) return authError;

    const sb = supabase(env);
    const { data: order, error: orderError } = await sb
      .from('orders')
      .select('status, tracking_number')
      .eq('id', params.orderId)
      .eq('user_id', user.id)
      .single();

    if (orderError) return err(orderError.message, 500);
    if (!order) return err('Commande introuvable', 404);

    // Corrigé : Utilisation de guillemets simples pour éviter les conflits avec les backticks
    const message = order.tracking_number
      ? `N° de suivi : ${order.tracking_number}`
      : 'Votre commande est en cours de traitement';

    return json({
      success: true,
      status: order.status,
      message: message
    });

  } catch (e) {
    return err(e.message, 500);
  }
}


