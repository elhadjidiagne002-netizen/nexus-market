// ============================================================
// functions/api/payments/paytech/init.js
// Cloudflare Pages Function — initialise un paiement PayTech
//
// Variables Cloudflare Pages :
//   PAYTECH_API_KEY      API key PayTech (tableau de bord paytech.sn)
//   PAYTECH_API_SECRET   API secret PayTech
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

  if (!env.PAYTECH_API_KEY || !env.PAYTECH_API_SECRET)
    return jsonR({ error: 'PAYTECH_API_KEY / PAYTECH_API_SECRET non configurées' }, 503);

  const uid = extractUid(request.headers.get('Authorization'));
  if (!uid) return jsonR({ error: 'Non authentifié' }, 401);

  let body;
  try { body = await request.json(); } catch { return jsonR({ error: 'JSON invalide' }, 400); }

  const { order_id, amount, item_name, success_url, cancel_url } = body;
  if (!order_id || !amount || !success_url || !cancel_url)
    return jsonR({ error: 'order_id, amount, success_url, cancel_url requis' }, 400);

  const ref_command = `NEXUS-${order_id.slice(-12).toUpperCase()}-${Date.now()}`;

  try {
    // 1. Appeler l'API PayTech
    const res = await fetch('https://paytech.sn/api/payment/request-payment', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        API_KEY: env.PAYTECH_API_KEY,
        API_SECRET: env.PAYTECH_API_SECRET,
      },
      body: JSON.stringify({
        item_name:   item_name || `Commande NEXUS #${order_id.slice(-8)}`,
        item_price:  String(Math.round(amount)),
        currency:    'XOF',
        ref_command,
        command_name: item_name || 'Commande NEXUS Market',
        env:          env.PAYTECH_API_KEY?.startsWith('test_') ? 'test' : 'prod',
        ipn_url:      `${new URL(success_url).origin}/api/payments/paytech/ipn`,
        success_url,
        cancel_url,
        custom_field: JSON.stringify({ order_id, user_id: uid }),
      }),
    });

    const data = await res.json();

    if (!res.ok || data.success !== 1) {
      console.error('[PayTech] Init error:', JSON.stringify(data));
      return jsonR({ error: data.errors?.[0] || 'Erreur PayTech' }, 400);
    }

    // 2. Persister la session PayTech en Supabase pour la réconciliation IPN
    await sbSet(env, 'stripe_sessions', {
      id:          crypto.randomUUID(),
      order_id:    order_id,
      session_id:  ref_command,
      provider:    'paytech',
      token:       data.token,
      status:      'pending',
      created_at:  new Date().toISOString(),
    }).catch(() => {});

    return jsonR({
      ok:           true,
      redirect_url: data.redirect_url,
      token:        data.token,
      ref_command,
    });

  } catch (err) {
    console.error('[PayTech] Exception:', err.message);
    return jsonR({ error: err.message }, 500);
  }
}
