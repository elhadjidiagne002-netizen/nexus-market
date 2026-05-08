import { CORS, options, json, err, supabase, requireAuth } from '';

export async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') return options();

  try {
    const [user, authError] = await requireAuth(request, env);
    if (authError) return authError;

    const sb = supabase(env);
    const url = new URL(request.url);
    const orderId = url.pathname.split('/').pop();

    if (request.method === 'POST') {
      const { status } = await request.json();
      if (!status) return err('Statut manquant', 400);

      const { data, error } = await sb
        .from('orders')
        .update({ status })
        .eq('id', orderId)
        .eq('buyer_id', user.id)
        .select()
        .single();

      if (error) throw error;
      if (!data) return err('Commande non trouvée', 404);
      return json(data);
    }

    return err('Méthode non supportée', 405);
  } catch (error) {
    return err(error.message, error.status || 500);
  }
}


