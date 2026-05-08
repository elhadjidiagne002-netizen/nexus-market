import { CORS, options, json, err, supabase, requireAuth } from '../_lib/utils.js';

export async function onRequest({ request, env, params }) {
  if (request.method === 'OPTIONS') return options();
  if (request.method !== 'GET') return err('GET requis', 405);

  try {
    const [user, authError] = await requireAuth(request, env);
    if (authError) return authError;

    const sb = supabase(env);

    // Utilisation de la syntaxe fluide de Supabase pour éviter les erreurs de backticks
    const { data: order, error: orderError } = await sb
      .from('orders')
      .select('*')
      .eq('id', params.orderId)
      .eq('user_id', user.id)
      .single();

    if (orderError) return err(orderError.message, 500);
    if (!order) return err('Commande introuvable', 404);

    return json({
      success: true,
      order: order
    });

  } catch (e) {
    return err(e.message, 500);
  }
}










