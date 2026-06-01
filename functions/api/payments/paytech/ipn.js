// ============================================================
// functions/api/payments/paytech/ipn.js
// Cloudflare Pages Function — IPN webhook PayTech
//
// PayTech appelle cette URL après chaque paiement confirmé.
// On vérifie le hash HMAC avant de marquer la commande paid.
// ============================================================

const jsonR = (d, s = 200) =>
  new Response(JSON.stringify(d), { status: s, headers: { 'Content-Type': 'application/json' } });

async function sha256hex(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function sbUpdate(env, table, filter, data) {
  return fetch(`${env.SUPABASE_URL}/rest/v1/${table}?${filter}`, {
    method: 'PATCH',
    headers: {
      apikey: env.SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(data),
  });
}

async function sbGet(env, path) {
  const r = await fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      apikey: env.SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
    },
  });
  return r.ok ? r.json() : [];
}

export async function onRequest({ request, env }) {
  if (request.method !== 'POST') return jsonR({ error: 'POST uniquement' }, 405);

  let payload;
  const ct = request.headers.get('Content-Type') || '';
  if (ct.includes('application/json')) {
    payload = await request.json().catch(() => ({}));
  } else {
    // form-encoded
    const text = await request.text();
    payload = Object.fromEntries(new URLSearchParams(text));
  }

  const { ref_command, token, api_key_sha256, api_secret_sha256, type_event, custom_field } = payload;

  // 1. Vérifier le hash HMAC PayTech
  const expectedKeyHash    = await sha256hex(env.PAYTECH_API_KEY || '');
  const expectedSecretHash = await sha256hex(env.PAYTECH_API_SECRET || '');

  if (api_key_sha256 !== expectedKeyHash || api_secret_sha256 !== expectedSecretHash) {
    console.error('[PayTech IPN] Hash invalide');
    return jsonR({ error: 'Hash invalide' }, 401);
  }

  // 2. Extraire l'order_id depuis custom_field
  let order_id = null;
  try {
    const cf = typeof custom_field === 'string' ? JSON.parse(custom_field) : custom_field;
    order_id = cf?.order_id;
  } catch { /* ignore */ }

  if (!order_id) {
    console.error('[PayTech IPN] order_id absent');
    return jsonR({ error: 'order_id manquant' }, 400);
  }

  const isPaid = type_event === 'sale_complete';

  // 3. Mettre à jour la commande
  await sbUpdate(env, 'orders', `id=eq.${order_id}`, {
    status:         isPaid ? 'processing' : 'payment_failed',
    payment_status: isPaid ? 'paid' : 'failed',
    payment_method: 'mobile',
    updated_at:     new Date().toISOString(),
  });

  // 4. Mettre à jour la session PayTech
  await sbUpdate(env, 'stripe_sessions', `session_id=eq.${ref_command}`, {
    status:     isPaid ? 'paid' : 'failed',
    updated_at: new Date().toISOString(),
  });

  // 5. Créer une notification in-app
  if (isPaid) {
    const orders = await sbGet(env, `orders?id=eq.${order_id}&select=buyer_id,total`);
    const order = orders?.[0];
    if (order?.buyer_id) {
      await fetch(`${env.SUPABASE_URL}/rest/v1/notifications`, {
        method: 'POST',
        headers: {
          apikey: env.SUPABASE_SERVICE_KEY,
          Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal',
        },
        body: JSON.stringify({
          id:         crypto.randomUUID(),
          user_id:    order.buyer_id,
          type:       'payment',
          title:      '✅ Paiement confirmé',
          message:    `Votre paiement de ${Number(order.total).toLocaleString('fr-FR')} FCFA a été reçu.`,
          link:       `/?order=${order_id}`,
          read:       false,
          created_at: new Date().toISOString(),
        }),
      });
    }
  }

  return jsonR({ ok: true });
}
