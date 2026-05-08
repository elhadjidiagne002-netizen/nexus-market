import { CORS, options, json, err, supabase, requireAuth, requireAdmin } from '../../_lib/utils.js';

export async function onRequest({ request, env, params }) {
  if (request.method === 'OPTIONS') return options();
  if (request.method !== 'POST') return err('POST requis', 405);

  try {
    // Vérification de l'authentification et des droits admin
    const [user, authError] = await requireAuth(request, env);
    if (authError) return authError;

    const isAdmin = await requireAdmin(user, env);
    if (!isAdmin) return err('Accès refusé : droits administrateur requis', 403);

    const sb = supabase(env);
    const { data: product, error: productError } = await sb
      .from('products')
      .select('id, name, is_visible')
      .eq('id', params.id)
      .single();

    if (productError) return err(productError.message, 500);
    if (!product) return err('Produit introuvable', 404);

    // Mise à jour de la visibilité du produit
    const { error: updateError } = await sb
      .from('products')
      .update({ is_visible: true })
      .eq('id', params.id);

    if (updateError) return err(updateError.message, 500);

    // Message de succès avec template literal corrigé
    const successMessage = `Votre produit "${product.name}" est maintenant visible.`;

    return json({
      success: true,
      message: successMessage,
      product: { id: product.id, name: product.name, is_visible: true }
    });

  } catch (e) {
    return err(e.message, 500);
  }
}

