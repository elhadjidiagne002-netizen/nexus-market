// ============================================================
// functions/api/payments/stripe/create-intent.js
// Cloudflare Pages Function
//
// Variables Cloudflare Pages :
//   STRIPE_SECRET_KEY   sk_live_... ou sk_test_...
//   SUPABASE_URL / SUPABASE_SERVICE_KEY
// ============================================================

import { requireAuth, validatePaymentAmount } from '../../_lib/utils.js';
import { rateLimit, clientIp, tooManyRequests } from '../../_lib/ratelimit.js';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};
const jsonR = (d, s = 200) =>
  new Response(JSON.stringify(d), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } });

export async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (request.method !== 'POST') return jsonR({ error: 'POST uniquement' }, 405);

  if (!env.STRIPE_SECRET_KEY) return jsonR({ error: 'STRIPE_SECRET_KEY non configurée' }, 503);

  // [SEC #2] Authentification RÉELLE : le JWT est vérifié côté Supabase
  // (signature comprise), au lieu d'être décodé en aveugle (forgeable).
  const [user, authErr] = await requireAuth(request, env);
  if (authErr) return authErr;
  const uid = user.id;

  // [SEC #4] Rate limiting : 10 créations de PaymentIntent / min / utilisateur (repli IP).
  const rl = await rateLimit(env, `stripeintent:${uid || clientIp(request)}`, 10, 60);
  if (!rl.allowed) return tooManyRequests(rl.resetAt, CORS);

  let body;
  try { body = await request.json(); } catch { return jsonR({ error: 'JSON invalide' }, 400); }

  const { amount, currency = 'eur', paymentMethodId, orderId, order_ids } = body;
  if (!amount || !paymentMethodId) return jsonR({ error: 'amount et paymentMethodId requis' }, 400);
  if (amount < 50) return jsonR({ error: 'Montant minimum : 50 centimes' }, 400);

  // [SEC #1] Pour la carte, la commande est créée APRÈS le paiement (flux
  // « payment-first ») : il n'y a donc pas encore de commande à comparer ici.
  // La validation du montant (amount_received == orders.total) est faite dans
  // le webhook Stripe, une fois la commande créée. On borne tout de même le
  // montant si des order_ids existants sont fournis (compat. futurs flux).
  const ids = Array.isArray(order_ids) && order_ids.length ? order_ids : (orderId ? [orderId] : []);
  if (ids.length) {
    const chk = await validatePaymentAmount(env, { orderIds: ids, uid, amountEur: Number(amount) / 100 });
    if (!chk.ok) return jsonR({ error: chk.error }, chk.status || 400);
  }

  try {
    // 1. Créer un PaymentIntent Stripe
    // [FIX] Les metadata Stripe se passent en `metadata[clé]` (form-urlencoded),
    // pas en JSON string — sinon Stripe les ignore et le webhook ne peut pas
    // retrouver la commande. On pose order_id (clé lue par le webhook) + user_id.
    const params = new URLSearchParams({
      amount: String(Math.round(amount)),
      currency,
      payment_method: paymentMethodId,
      confirm: 'true',
      'automatic_payment_methods[enabled]': 'true',
      'automatic_payment_methods[allow_redirects]': 'never',
      description: 'Commande NEXUS Market',
      'metadata[user_id]': uid,
      ...(ids[0] ? { 'metadata[order_id]': String(ids[0]) } : {}),
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
