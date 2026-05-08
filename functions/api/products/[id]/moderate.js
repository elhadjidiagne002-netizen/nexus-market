import { CORS, options, json, err, supabase, requireAuth } from '../../../_lib/utils.js';

export async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') return options();

  try {
    const [user, authError] = await requireAuth(request, env);
    if (authError) return authError;
    if (user.role !== 'admin') return err('Accès refusé', 403);

    const sb = supabase(env);
    const url = new URL(request.url);
    const productId = url.pathname.split('/').pop();

    if (request.method === 'POST') {
      const { approved, reason } = await request.json();
      if (typeof approved !== 'boolean') return err('Statut de modération invalide', 400);

      const { data, error } = await sb
        .from('products')
        .update({
          is_approved: approved,
          moderation_reason: reason,
          moderated_at: new Date().toISOString(),
          moderated_by: user.id
        })
        .eq('id', productId)
        .select()
        .single();

      if (error) throw error;
      if (!data) return err('Produit non trouvé', 404);
      return json(data);
    }

    return err('Méthode non supportée', 405);
  } catch (error) {
    return err(error.message, error.status || 500);
  }
}






