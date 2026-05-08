import { CORS, options, json, err, requireAuth } from '../../../../_lib/utils.js';

export async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') return options();
  if (request.method !== 'POST') return err('POST requis', 405);
  try {
    const [user, e] = await requireAuth(request, env);
    if (e) return e;
    if (!env.STRIPE_SECRET_KEY) return err('Stripe non configuré', 503);
    const { amount, currency = 'eur', orderId, description } = await request.json();
    if (!amount || amount <= 0) return err('Montant invalide', 400);

    const body = new URLSearchParams({
      amount: Math.round(amount * 100).toString(),
      currency,
      'metadata[order_id]': orderId || '',
      'metadata[user_id]': user.id,
      description: description || 'NEXUS Market',
      'automatic_payment_methods[enabled]': 'true',
    });
    const res = await fetch('https://api.stripe.com/v1/payment_intents', {
      method: 'POST',
      headers: {
        Authorization: \`Bearer \${env.STRIPE_SECRET_KEY}\`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    });
    const data = await res.json();
    if (!res.ok) return err(data.error?.message || 'Erreur Stripe', res.status);
    return json({ clientSecret: data.client_secret, intentId: data.id });
  } catch (e) { return err(e.message, 500); }
}
