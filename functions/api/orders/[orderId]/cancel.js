import { CORS, options, json, err, supabase, requireAuth } from '';

export async function onRequest({ request, env, params }) {
  if (request.method === 'OPTIONS') return options();
  if (request.method !== 'POST') return err('POST requis', 405);

  try {
    const [user, authError] = await requireAuth(request, env);
    if (authError) return authError;

    const sb = supabase(env);
    const { data: order, error: orderError } = await sb
      .from('orders')
      .select('status')
      .eq('id', params.orderId)
      .eq('user_id', user.id)
      .single();

    if (orderError) return err(orderError.message, 500);
    if (order.status !== 'pending') {
      return err('Impossible d\'annuler une commande déjà expédiée ou traitée', 400);
    }

    const { error: updateError } = await sb
      .from('orders')
      .update({ status: 'cancelled', cancelled_at: new Date().toISOString() })
      .eq('id', params.orderId)
      .eq('user_id', user.id);

    if (updateError) return err(updateError.message, 500);

    return json({ success: true, message: 'Commande annulée avec succès' });
  } catch (e) {
    return err(e.message, 500);
  }
}




