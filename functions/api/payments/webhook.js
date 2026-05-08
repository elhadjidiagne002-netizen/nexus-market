import { CORS, options, json, err } from '../../../_lib/utils.js';

export async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') return options();
  if (request.method !== 'POST') return err('POST requis', 405);

  try {
    // Récupérer le corps brut de la requête (nécessaire pour Stripe)
    const rawBody = await request.text();
    const signature = request.headers.get('stripe-signature');

    if (!signature) {
      return err('Signature Stripe manquante', 400);
    }

    // Vérifier la signature (à implémenter selon votre clé Stripe)
    // Exemple : const isValid = verifyStripeSignature(rawBody, signature, env.STRIPE_WEBHOOK_SECRET);

    // Parse le corps de la requête
    let event;
    try {
      event = JSON.parse(rawBody);
    } catch (parseError) {
      return err('Corps de la requête invalide', 400);
    }

    // Traiter l'événement Stripe
    switch (event.type) {
      case 'payment_intent.succeeded':
        const paymentIntent = event.data.object;
        // Logique pour une transaction réussie
        console.log(`Paiement réussi pour l'intent ${paymentIntent.id}`);
        break;

      case 'payment_intent.payment_failed':
        const failedPayment = event.data.object;
        // Logique pour une transaction échouée
        console.error(`Paiement échoué pour l'intent ${failedPayment.id}`);
        break;

      default:
        console.log(`Événement non géré : ${event.type}`);
    }

    // Répondre avec un statut 200 pour confirmer la réception
    return json({ received: true, event: event.type }, 200);

  } catch (error) {
    console.error('Erreur dans le webhook Stripe:', error);
    return err(error.message, 500);
  }
}
