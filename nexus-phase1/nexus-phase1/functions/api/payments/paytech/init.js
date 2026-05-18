/**
 * POST /api/payments/paytech/init
 * Initie une transaction PayTech depuis le backend (où vivent les clés secrètes).
 *
 * Variables d'environnement requises (Cloudflare Pages → Settings → Environment variables) :
 *   PAYTECH_API_KEY     — clé publique fournie par PayTech
 *   PAYTECH_API_SECRET  — secret API
 *   PAYTECH_ENV         — "test" ou "prod"
 *
 * Body attendu (JSON) :
 *   { order_id, amount, currency, item_name, item_count?, command_name?,
 *     ref_command?, env?, customField?, ipn_url?, success_url?, cancel_url? }
 */
export async function onRequestPost(context) {
  const { request, env } = context;

  // ── Vérification config ──────────────────────────────────────────────────
  if (!env.PAYTECH_API_KEY || !env.PAYTECH_API_SECRET) {
    return json({ error: 'PayTech non configuré (variables PAYTECH_API_KEY / PAYTECH_API_SECRET manquantes)' }, 503);
  }

  // ── Vérification auth (JWT Bearer) ───────────────────────────────────────
  const auth = request.headers.get('Authorization');
  if (!auth || !auth.startsWith('Bearer ')) {
    return json({ error: 'Non authentifié' }, 401);
  }

  // ── Parsing body ─────────────────────────────────────────────────────────
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Body JSON invalide' }, 400);
  }

  const {
    order_id,
    amount,
    currency = 'XOF',
    item_name = 'Commande NEXUS Market',
    item_count = 1,
    command_name = 'Achat NEXUS Market',
    ref_command,
    customField = {},
    ipn_url,
    success_url,
    cancel_url
  } = body;

  if (!order_id || !amount) {
    return json({ error: 'order_id et amount obligatoires' }, 400);
  }

  // ── Construction de la requête vers PayTech ──────────────────────────────
  const paytechEnv = env.PAYTECH_ENV || 'test';
  const origin = new URL(request.url).origin;

  const payload = {
    item_name,
    item_price: Number(amount),
    currency: String(currency).toLowerCase(),
    ref_command: ref_command || order_id,
    command_name,
    env: paytechEnv,
    ipn_url:     ipn_url     || `${origin}/api/payments/paytech/ipn`,
    success_url: success_url || `${origin}/#/order/${order_id}/success`,
    cancel_url:  cancel_url  || `${origin}/#/order/${order_id}/cancel`,
    custom_field: JSON.stringify({ order_id, ...customField })
  };

  // ── Appel PayTech ────────────────────────────────────────────────────────
  let paytechRes;
  try {
    paytechRes = await fetch('https://paytech.sn/api/payment/request-payment', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'API_KEY': env.PAYTECH_API_KEY,
        'API_SECRET': env.PAYTECH_API_SECRET
      },
      body: JSON.stringify(payload)
    });
  } catch (e) {
    return json({ error: 'PayTech injoignable', detail: e.message }, 502);
  }

  let data;
  try {
    data = await paytechRes.json();
  } catch {
    return json({ error: 'Réponse PayTech invalide' }, 502);
  }

  if (!paytechRes.ok || data.success !== 1) {
    return json({ error: data.message || 'Échec PayTech', detail: data }, 400);
  }

  // Réponse attendue par le frontend
  return json({
    success: true,
    token: data.token,
    redirect_url: data.redirect_url || data.redirectUrl,
    ref_command: payload.ref_command
  });
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}
