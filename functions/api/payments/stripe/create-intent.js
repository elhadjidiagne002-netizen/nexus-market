// ============================================================
// functions/api/payments/stripe/create-intent.js
// Cloudflare Pages Function
//
// Variables Cloudflare Pages :
//   STRIPE_SECRET_KEY   sk_live_... ou sk_test_...
//   SUPABASE_URL / SUPABASE_SERVICE_KEY
// ============================================================

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};
const jsonR = (d, s = 200) =>
  new Response(JSON.stringify(d), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } });

function extractUid(authHeader) {
  try {
    const token = authHeader?.replace('Bearer ', '');
    if (!token) return null;
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return payload.sub || null;
  } catch { return null; }
}

export async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (request.method !== 'POST') return jsonR({ error: 'POST uniquement' }, 405);

  if (!env.STRIPE_SECRET_KEY) return jsonR({ error: 'STRIPE_SECRET_KEY non configurée' }, 503);

  const uid = extractUid(request.headers.get('Authorization'));
  if (!uid) return jsonR({ error: 'Non authentifié' }, 401);

  let body;
  try { body = await request.json(); } catch { return jsonR({ error: 'JSON invalide' }, 400); }

  const { amount, currency = 'eur', paymentMethodId } = body;
  if (!amount || !paymentMethodId) return jsonR({ error: 'amount et paymentMethodId requis' }, 400);
  if (amount < 50) return jsonR({ error: 'Montant minimum : 50 centimes' }, 400);

  try {
    // 1. Créer un PaymentIntent Stripe
    const params = new URLSearchParams({
      amount: String(Math.round(amount)),
      currency,
      payment_method: paymentMethodId,
      confirm: 'true',
      'automatic_payment_methods[enabled]': 'true',
      'automatic_payment_methods[allow_redirects]': 'never',
      description: 'Commande NEXUS Market',
      metadata: JSON.stringify({ user_id: uid }),
    });

    const res = await fetch('https://api.stripe.com/v1/payment_intents', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    const intent = await res.json();

    if (!res.ok) {
      console.error('[Stripe] API error:', intent.error?.message);
      return jsonR({ error: intent.error?.message || 'Erreur Stripe' }, 400);
    }

    // 2. Retourner au client
    return jsonR({
      ok:              true,
      paymentIntentId: intent.id,
      clientSecret:    intent.client_secret,
      status:          intent.status,   // 'succeeded' | 'requires_action' | ...
    });

  } catch (err) {
    console.error('[Stripe] Exception:', err.message);
    return jsonR({ error: err.message }, 500);
  }
}
