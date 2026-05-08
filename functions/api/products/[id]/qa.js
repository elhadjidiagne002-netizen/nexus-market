import { CORS, options, json, err, supabase, requireAuth } from '../../_lib/utils.js';

export async function onRequest({ request, env, params }) {
  if (request.method === 'OPTIONS') return options();
  if (request.method !== 'POST') return err('POST requis', 405);

  try {
    // Vérification de l'authentification
    const [user, authError] = await requireAuth(request, env);
    if (authError) return authError;

    // Récupération des données de la requête
    const { question } = await request.json();
    if (!question) return err('La question est requise', 400);

    const sb = supabase(env);

    // Vérification que le produit appartient à l'utilisateur
    const { data: product, error: productError } = await sb
      .from('products')
      .select('id, name, user_id')
      .eq('id', params.id)
      .single();

    if (productError) return err(productError.message, 500);
    if (!product) return err('Produit introuvable', 404);
    if (product.user_id !== user.id) return err('Accès refusé : ce produit ne vous appartient pas', 403);

    // Enregistrement de la question
    const { error: qaError } = await sb
      .from('product_questions')
      .insert({
        product_id: params.id,
        user_id: user.id,
        question: question,
        created_at: new Date().toISOString()
      });

    if (qaError) return err(qaError.message, 500);

    // Message de succès avec template literal corrigé
    const successMessage = `Un client a posé une question sur un de vos produits : "${question}".`;

    return json({
      success: true,
      message: successMessage,
      question: { product_id: params.id, question: question }
    });

  } catch (e) {
    return err(e.message, 500);
  }
}

