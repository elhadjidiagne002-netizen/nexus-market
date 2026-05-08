import { CORS, options, json, err } from '../../../_lib/utils.js';

export async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') return options();
  if (request.method !== 'POST') return err('POST requis', 405);

  try {
    const rawBody = await request.text();
    const signature = request.headers.get('stripe-signature');

    if (!signature) {
      return err('Signature Stripe manquante', 400);
    }

    let event;
    try {
      event = JSON.parse(rawBody);
    } catch (parseError) {
      return err('Corps de la requête invalide', 400);
    }

    switch (event.type) {
      case 'payment_intent.succeeded':
        console.log(`Paiement réussi pour l'intent ${event.data.object.id}`);
        break;
      case 'payment_intent.payment_failed':
        console.error(`Paiement échoué pour l'intent ${event.data.object.id}`);
        break;
      default:
        console.log(`Événement non géré : ${event.type}`);
    }

    return json({ received: true, event: event.type }, 200);
  } catch (error) {
    return err(error.message, 500);
  }
}
