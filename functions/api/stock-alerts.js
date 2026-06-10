// ============================================================
// functions/api/stock-alerts.js — NEXUS Market Alertes Stock
// Cloudflare Pages Function
//
// Variables Cloudflare Pages :
//   SUPABASE_URL          https://xxxx.supabase.co
//   SUPABASE_SERVICE_KEY  clé service_role
//   VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT  (push notifs)
//
// Routes :
//   GET    /api/stock-alerts              → liste alertes de l'utilisateur
//   POST   /api/stock-alerts              → s'abonner à un produit
//   DELETE /api/stock-alerts/:productId   → se désabonner
//   POST   /api/stock-alerts/notify/:productId → déclencher les notifications
//   POST   /api/stock-alerts/migrate      → migrer localStorage → Supabase
// ============================================================

import { sendEventEmail } from './_lib/notify.js';
// [SEC #2] JWT vérifié côté Supabase (signature) plutôt que décodé en aveugle.
import { requireAuth } from './_lib/utils.js';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

const jsonR = (d, s = 200) =>
  new Response(JSON.stringify(d), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } });

// ── Supabase helper ─────────────────────────────────────────
async function sb(env, path, method = 'GET', body = null, extra = {}) {
  const r = await fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: env.SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...extra,
    },
    body: body ? JSON.stringify(body) : null,
  });
  if (method !== 'GET' && !r.ok) return { ok: false, status: r.status, data: null };
  if (!r.ok) return { data: [], ok: false };
  const data = await r.json().catch(() => []);
  return { data, ok: true };
}

// ── VAPID push (réutilise la logique de push.js) ─────────────
function b64urlToBytes(b64) {
  const pad = '='.repeat((4 - b64.length % 4) % 4);
  return Uint8Array.from(atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
}
function bytesToB64url(buf) {
  const bytes = buf instanceof ArrayBuffer ? new Uint8Array(buf) : buf;
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}
function jsonToB64url(obj) {
  return bytesToB64url(new TextEncoder().encode(JSON.stringify(obj)));
}

async function makeVapidAuth(privB64, pubB64, endpoint, subject) {
  const pub = b64urlToBytes(pubB64);
  const x = bytesToB64url(pub.slice(1, 33));
  const y = bytesToB64url(pub.slice(33, 65));
  const key = await crypto.subtle.importKey(
    'jwk', { kty: 'EC', crv: 'P-256', d: privB64, x, y },
    { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']
  );
  const { origin } = new URL(endpoint);
  const now = Math.floor(Date.now() / 1000);
  const h = jsonToB64url({ typ: 'JWT', alg: 'ES256' });
  const p = jsonToB64url({ aud: origin, exp: now + 43200, sub: subject });
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, new TextEncoder().encode(`${h}.${p}`));
  return { jwt: `${h}.${p}.${bytesToB64url(new Uint8Array(sig))}`, pubKey: pubB64 };
}

async function sendPushToUser(userId, payload, env) {
  const { data: subs } = await sb(env, `push_subscriptions?user_id=eq.${userId}&select=subscription`);
  if (!Array.isArray(subs) || !subs.length) return 0;
  let sent = 0;
  await Promise.allSettled(subs.map(async row => {
    const { endpoint, keys } = row.subscription;
    const { jwt, pubKey } = await makeVapidAuth(env.VAPID_PRIVATE_KEY, env.VAPID_PUBLIC_KEY, endpoint, env.VAPID_SUBJECT);
    const body = new TextEncoder().encode(JSON.stringify(payload));
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { Authorization: `vapid t=${jwt},k=${pubKey}`, TTL: '86400', Urgency: 'normal', 'Content-Type': 'application/octet-stream' },
      body,
    });
    if (res.ok) sent++;
    else if (res.status === 410) {
      await sb(env, `push_subscriptions?endpoint=eq.${encodeURIComponent(endpoint)}`, 'DELETE');
    }
  }));
  return sent;
}

// ── Handler principal ────────────────────────────────────────
export async function onRequest({ request, env, params }) {
  const method = request.method.toUpperCase();
  if (method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

  const url = new URL(request.url);
  const pathParts = url.pathname.split('/').filter(Boolean);
  // pathParts = ['api', 'stock-alerts', ...rest]
  const rest = pathParts.slice(2); // ex: ['notify', ':productId'] ou [':productId']
  // [SEC #2] Résolution vérifiée du user_id (signature JWT contrôlée par
  // Supabase). uid reste null si le token est absent/invalide → les routes
  // protégées renvoient alors 401 comme avant.
  let uid = null;
  const [authUser] = await requireAuth(request, env);
  if (authUser && authUser.id) uid = authUser.id;

  // POST /api/stock-alerts/notify/:productId — déclencher les notifications
  if (method === 'POST' && rest[0] === 'notify' && rest[1]) {
    const productId = rest[1];

    // Récupérer les infos produit
    const { data: prods } = await sb(env, `products?id=eq.${productId}&select=id,name,price,stock`);
    const product = prods?.[0];
    if (!product) return jsonR({ error: 'Produit introuvable' }, 404);
    if ((product.stock || 0) <= 0) return jsonR({ ok: false, reason: 'Toujours hors stock' });

    // Récupérer tous les abonnés pour ce produit
    const { data: alerts } = await sb(env, `stock_alerts?product_id=eq.${productId}&notified=is.false&select=user_id,user_email`);
    if (!alerts?.length) return jsonR({ ok: true, notified: 0 });

    let notified = 0;
    const notifyPayload = {
      title: '✅ De nouveau disponible !',
      message: `${product.name} est à nouveau en stock.`,
      url: `/?product=${productId}`,
      type: 'stock',
    };

    for (const alert of alerts) {
      // Push notification
      if (env.VAPID_PRIVATE_KEY && env.VAPID_PUBLIC_KEY) {
        await sendPushToUser(alert.user_id, notifyPayload, env);
      }

      // Notification in-app Supabase
      await sb(env, 'notifications', 'POST', {
        id: crypto.randomUUID(),
        user_id: alert.user_id,
        // type ∈ {order,offer,message,return,vendor,system,dispute} → 'system'
        type: 'system',
        title: notifyPayload.title,
        message: notifyPayload.message,
        link: notifyPayload.url,
        read: false,
        created_at: new Date().toISOString(),
      });

      // Email "de nouveau en stock" (centre de notifications)
      if (env.RESEND_API_KEY && alert.user_email) {
        await sendEventEmail(env, 'stock_back', alert.user_email, {
          buyer_name: 'Client', product_name: product.name,
          product_url: notifyPayload.url, _userId: alert.user_id || null,
        }).catch(() => {});
      }

      notified++;
    }

    // Marquer les alertes comme notifiées
    await sb(env, `stock_alerts?product_id=eq.${productId}&notified=is.false`, 'PATCH', { notified: true, notified_at: new Date().toISOString() });

    return jsonR({ ok: true, notified });
  }

  // POST /api/stock-alerts/migrate — migrer localStorage → Supabase
  if (method === 'POST' && rest[0] === 'migrate') {
    if (!uid) return jsonR({ error: 'Non authentifié' }, 401);
    let body;
    try { body = await request.json(); } catch { return jsonR({ error: 'JSON invalide' }, 400); }
    const productIds = body.productIds || [];
    if (!productIds.length) return jsonR({ ok: true, migrated: 0 });

    let migrated = 0;
    for (const pid of productIds) {
      const res = await sb(env, 'stock_alerts', 'POST', {
        id: crypto.randomUUID(),
        user_id: uid,
        product_id: pid,
        notified: false,
        created_at: new Date().toISOString(),
      });
      if (res.ok) migrated++;
    }
    return jsonR({ ok: true, migrated });
  }

  // GET /api/stock-alerts — liste des alertes de l'utilisateur
  if (method === 'GET' && !rest.length) {
    if (!uid) return jsonR({ error: 'Non authentifié' }, 401);
    const { data } = await sb(env, `stock_alerts?user_id=eq.${uid}&select=product_id`);
    return jsonR({ productIds: (data || []).map(a => a.product_id) });
  }

  // POST /api/stock-alerts — s'abonner
  if (method === 'POST' && !rest.length) {
    if (!uid) return jsonR({ error: 'Non authentifié' }, 401);
    let body;
    try { body = await request.json(); } catch { return jsonR({ error: 'JSON invalide' }, 400); }
    const { productId } = body;
    if (!productId) return jsonR({ error: 'productId requis' }, 400);

    // Upsert — pas de doublon
    await sb(env, `stock_alerts?user_id=eq.${uid}&product_id=eq.${productId}`, 'DELETE');
    await sb(env, 'stock_alerts', 'POST', {
      id: crypto.randomUUID(), user_id: uid, product_id: productId, notified: false, created_at: new Date().toISOString(),
    });
    return jsonR({ ok: true });
  }

  // DELETE /api/stock-alerts/:productId — se désabonner
  if (method === 'DELETE' && rest[0]) {
    if (!uid) return jsonR({ error: 'Non authentifié' }, 401);
    await sb(env, `stock_alerts?user_id=eq.${uid}&product_id=eq.${rest[0]}`, 'DELETE');
    return jsonR({ ok: true });
  }

  return jsonR({ error: 'Route introuvable' }, 404);
}
