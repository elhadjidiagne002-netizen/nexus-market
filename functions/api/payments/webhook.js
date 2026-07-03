// functions/api/payments/webhook.js — DÉSACTIVÉ (2026-07-03)
//
// Ancien handler Stripe DOUBLON qui ne vérifiait PAS la signature (il parsait le
// JSON brut et faisait uniquement du console.log — aucune écriture DB). Conservé
// vide pour éviter qu'un appelant/attaquant le prenne pour un webhook valide.
//
// Webhook Stripe canonique = /api/webhooks/stripe (functions/api/webhooks/stripe.js),
// qui vérifie la signature HMAC + anti-replay. Ne PAS re-brancher cet endpoint.
import { options, err } from '../_lib/utils.js';

export async function onRequest({ request }) {
  if (request.method === 'OPTIONS') return options();
  // 410 Gone : endpoint retiré, utiliser /api/webhooks/stripe.
  return err('Endpoint retiré — utiliser /api/webhooks/stripe', 410);
}
