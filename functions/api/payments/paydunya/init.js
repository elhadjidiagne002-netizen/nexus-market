// ============================================================
// functions/api/payments/paydunya/init.js
// Cloudflare Pages Function — initialise un paiement PayDunya (Wave / Orange
// Money / carte) via l'API REST, en `fetch` natif (Workers-compatible).
//
// RÔLE : agrégateur de SECOURS (fallback) de PayTech. Le front tente PayTech en
// premier ; si l'init PayTech échoue, il appelle CET endpoint. Voir la note de
// câblage dans .env.example / JOURNAL.
//
// ⚠️ DORMANT tant que les variables PAYDUNYA_* ne sont pas définies : renvoie 503
// (comme le fait PayTech sans ses clés) → aucun impact sur le flux existant.
// ⚠️ PROTOTYPE : à valider en SANDBOX PayDunya avant mise en production (format
// exact de l'URL de checkout hébergée à confirmer selon la doc PayDunya).
//
// Variables Cloudflare Pages :
//   PAYDUNYA_MASTER_KEY / PAYDUNYA_PRIVATE_KEY / PAYDUNYA_PUBLIC_KEY / PAYDUNYA_TOKEN
//   PAYDUNYA_STORE_NAME   (nom de la boutique affiché sur la facture)
//   PAYDUNYA_ENV          'test' (sandbox) | 'prod'  (défaut : 'test')
//   SUPABASE_URL / SUPABASE_SERVICE_KEY
// ============================================================

import { requireAuth, validatePaymentAmount, validateBoostAmount, validateProSubscription, validateStoryFee, validateFlashSale, validateB2bPriority, validateTransportBooking } from '../../_lib/utils.js';
import { rateLimit, clientIp, tooManyRequests } from '../../_lib/ratelimit.js';
import { logPaymentEvent } from '../../_lib/payment-log.js';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};
const jsonR = (d, s = 200) =>
  new Response(JSON.stringify(d), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } });

async function sbSet(env, path, body) {
  return fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, {
    method: 'POST',
    headers: {
      apikey: env.SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(body),
  });
}

export async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (request.method !== 'POST') return jsonR({ error: 'POST uniquement' }, 405);

  // Credential-gated : dormant sans clés PayDunya (fallback non configuré).
  if (!env.PAYDUNYA_MASTER_KEY || !env.PAYDUNYA_PRIVATE_KEY || !env.PAYDUNYA_TOKEN)
    return jsonR({ error: 'PayDunya non configuré (PAYDUNYA_MASTER_KEY / PRIVATE_KEY / TOKEN)' }, 503);

  // Auth réelle (JWT vérifié Supabase) + rate limiting, identiques au flux PayTech.
  const [user, authErr] = await requireAuth(request, env);
  if (authErr) return authErr;
  const uid = user.id;

  const rl = await rateLimit(env, `payinit:${uid || clientIp(request)}`, 10, 60);
  if (!rl.allowed) return tooManyRequests(rl.resetAt, CORS);

  let body;
  try { body = await request.json(); } catch { return jsonR({ error: 'JSON invalide' }, 400); }

  const { order_id, amount, item_name, success_url, cancel_url, order_ids, kind, boost_id, sub_id, story_id, flash_id, quote_id, booking_id } = body;
  if (!order_id || !amount || !success_url || !cancel_url)
    return jsonR({ error: 'order_id, amount, success_url, cancel_url requis' }, 400);

  // [SEC] Validation du montant côté serveur, par TYPE — mêmes validateurs que PayTech.
  if (kind === 'pro') {
    const chk = await validateProSubscription(env, { subId: sub_id, uid, amountXof: Number(amount) });
    if (!chk.ok) return jsonR({ error: chk.error }, chk.status || 400);
  } else if (kind === 'boost') {
    const chk = await validateBoostAmount(env, { boostId: boost_id, uid, amountXof: Number(amount) });
    if (!chk.ok) return jsonR({ error: chk.error }, chk.status || 400);
  } else if (kind === 'story') {
    const chk = await validateStoryFee(env, { storyId: story_id || order_id, uid, amountXof: Number(amount) });
    if (!chk.ok) return jsonR({ error: chk.error }, chk.status || 400);
  } else if (kind === 'flash') {
    const chk = await validateFlashSale(env, { flashId: flash_id || order_id, uid, amountXof: Number(amount) });
    if (!chk.ok) return jsonR({ error: chk.error }, chk.status || 400);
  } else if (kind === 'b2b_priority') {
    const chk = await validateB2bPriority(env, { quoteId: quote_id || order_id, uid, amountXof: Number(amount) });
    if (!chk.ok) return jsonR({ error: chk.error }, chk.status || 400);
  } else if (kind === 'transport') {
    const chk = await validateTransportBooking(env, { bookingId: booking_id || order_id, uid, amountXof: Number(amount) });
    if (!chk.ok) return jsonR({ error: chk.error }, chk.status || 400);
  } else {
    const EUR_TO_XOF = parseFloat(env.EUR_TO_XOF || '655.957');
    const ids = Array.isArray(order_ids) && order_ids.length ? order_ids : (order_id ? [order_id] : []);
    const chk = await validatePaymentAmount(env, { orderIds: ids, uid, amountEur: Number(amount) / EUR_TO_XOF });
    if (!chk.ok) return jsonR({ error: chk.error }, chk.status || 400);
  }

  const ref_command = `NEXUS-${order_id.slice(-12).toUpperCase()}-${Date.now()}`;
  const mode = env.PAYDUNYA_ENV || 'test';
  const apiBase = mode === 'prod' ? 'https://app.paydunya.com/api/' : 'https://app.sandbox.paydunya.com/api/';

  // custom_data : porte les identifiants que l'IPN PayDunya réinjectera dans le
  // fulfillment (même sémantique que le custom_field PayTech). `transaction_id`
  // requis par PayDunya ; on n'ajoute que la clé pertinente selon le kind.
  const customData = { transaction_id: ref_command, user_id: uid, kind: kind || 'order' };
  if (kind === 'pro') customData.sub_id = sub_id;
  else if (kind === 'boost') customData.boost_id = boost_id;
  else if (kind === 'story') customData.story_id = story_id || order_id;
  else if (kind === 'flash') customData.flash_id = flash_id || order_id;
  else if (kind === 'b2b_priority') customData.quote_id = quote_id || order_id;
  else if (kind === 'transport') customData.booking_id = booking_id || order_id;
  else customData.order_id = order_id;

  try {
    // 1. Créer la facture PayDunya (montant en XOF entier).
    const res = await fetch(`${apiBase}v1/checkout-invoice/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'PAYDUNYA-MASTER-KEY':  env.PAYDUNYA_MASTER_KEY,
        'PAYDUNYA-PRIVATE-KEY': env.PAYDUNYA_PRIVATE_KEY,
        'PAYDUNYA-PUBLIC-KEY':  env.PAYDUNYA_PUBLIC_KEY || '',
        'PAYDUNYA-TOKEN':       env.PAYDUNYA_TOKEN,
      },
      body: JSON.stringify({
        invoice: {
          total_amount: Math.round(Number(amount)),
          description:  item_name || `Commande NEXUS #${String(order_id).slice(-8)}`,
        },
        store: { name: env.PAYDUNYA_STORE_NAME || 'NEXUS Market' },
        actions: { cancel_url, return_url: success_url },
        custom_data: customData,
      }),
    });

    const data = await res.json().catch(() => null);

    // response_code "00" = succès (cf. SDK paydunya.ts) ; sinon on remonte la raison réelle.
    if (!res.ok || !data || data.response_code !== '00' || !data.token) {
      console.error('[PayDunya] Init error:', res.status, JSON.stringify(data));
      const detail = (data && (data.response_text || data.description)) || ('PayDunya a refusé (HTTP ' + res.status + ')');
      return jsonR({ error: 'PayDunya : ' + detail }, 400);
    }

    // 2. URL de checkout hébergée PayDunya.
    // ⚠️ Format à CONFIRMER en sandbox : selon la doc, redirection vers la page de
    //    facture par token. On privilégie une URL renvoyée par l'API si présente.
    const checkoutBase = mode === 'prod'
      ? 'https://paydunya.com/checkout/invoice/'
      : 'https://paydunya.com/sandbox-checkout/invoice/';
    const redirect_url = (typeof data.response_text === 'string' && /^https?:\/\//.test(data.response_text))
      ? data.response_text
      : `${checkoutBase}${data.token}`;

    // 3. Persister la session pour la réconciliation IPN (mêmes colonnes que PayTech).
    const isUuid = typeof order_id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(order_id);
    await sbSet(env, 'stripe_sessions', {
      id:             crypto.randomUUID(),
      order_id:       isUuid ? order_id : null,
      session_id:     ref_command,
      payment_intent: data.token,
      user_id:        uid || null,
      amount:         Math.round(Number(amount)),
      currency:       'XOF',
      status:         'pending',
      created_at:     new Date().toISOString(),
    }).catch(() => {});

    await logPaymentEvent(env, {
      provider: 'paydunya', event_type: 'init',
      order_id: isUuid ? order_id : null, ref: ref_command,
      amount: Math.round(Number(amount)), status: 'pending', note: kind || 'order',
    });

    return jsonR({ ok: true, provider: 'paydunya', redirect_url, token: data.token, ref_command });

  } catch (err) {
    console.error('[PayDunya] Exception:', err.message);
    return jsonR({ error: err.message }, 500);
  }
}
