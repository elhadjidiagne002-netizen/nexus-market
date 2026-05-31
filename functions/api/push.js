// ============================================================
// functions/api/push.js — NEXUS Market Push API v2
// Cloudflare Pages Function — aucune dépendance npm
// Chiffrement RFC 8291 (aes128gcm) via Web Crypto natif
//
// Variables Cloudflare Pages → Settings → Environment Variables :
//   VAPID_PUBLIC_KEY   BOwSdy9yss_MkDp70vKoHbqyEBclOVkdM3K9UyV_GvHJujUxvsdpPRKcQJTZmp8kwnMgKsR0xGT1BSren7m6oF0
//   VAPID_PRIVATE_KEY  c_sPmJ7KJzVW4ZGIheVHPiCF8fq5lBF09-tH96vRSH0
//   VAPID_SUBJECT      mailto:admin@nexus.sn
//   SUPABASE_URL       https://xxxx.supabase.co
//   SUPABASE_SERVICE_KEY  <clé service_role>
//
// Routes :
//   GET  /api/push                                → {publicKey}
//   POST /api/push {action:'subscribe', ...}      → enregistre abonnement
//   POST /api/push {action:'unsubscribe', ...}    → supprime abonnement
//   POST /api/push {action:'send', ...}           → envoie notification
// ============================================================

// ── base64url helpers ────────────────────────────────────────

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

// ── HKDF (RFC 5869) ──────────────────────────────────────────

async function hkdfExtract(salt, ikm) {
  const k = await crypto.subtle.importKey('raw', salt, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, ikm));
}

async function hkdfExpand(prk, info, len) {
  const k = await crypto.subtle.importKey('raw', prk, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const infoBytes = info instanceof Uint8Array ? info : new Uint8Array(info);
  const t1 = await crypto.subtle.sign('HMAC', k, new Uint8Array([...infoBytes, 0x01]));
  return new Uint8Array(t1).slice(0, len);
}

// ── Chiffrement RFC 8291 (aes128gcm) ─────────────────────────
// Requis par Chrome/FCM pour les payloads avec contenu.

async function encryptPayload(plaintext, p256dhB64, authB64) {
  const subPub    = b64urlToBytes(p256dhB64);  // 65 bytes uncompressed
  const authSec   = b64urlToBytes(authB64);    // 16 bytes

  // 1. Clé éphémère ECDH serveur
  const srvPair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const srvPubRaw = new Uint8Array(await crypto.subtle.exportKey('raw', srvPair.publicKey));

  // 2. Import clé publique abonné pour ECDH
  const subKey = await crypto.subtle.importKey('raw', subPub, { name: 'ECDH', namedCurve: 'P-256' }, false, []);

  // 3. Secret partagé ECDH (256 bits)
  const ecdhSecret = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: subKey }, srvPair.privateKey, 256));

  // 4. IKM (RFC 8291 §3.2)
  const authInfo = new Uint8Array([
    ...new TextEncoder().encode('WebPush: info\x00'),
    ...subPub,    // 65 bytes
    ...srvPubRaw, // 65 bytes
  ]);
  const prkAuth = await hkdfExtract(authSec, ecdhSecret);
  const ikm     = await hkdfExpand(prkAuth, authInfo, 32);

  // 5. CEK et nonce (RFC 8188 §2.1)
  const salt       = crypto.getRandomValues(new Uint8Array(16));
  const prkContent = await hkdfExtract(salt, ikm);
  const cek        = await hkdfExpand(prkContent, new TextEncoder().encode('Content-Encoding: aes128gcm\x00'), 16);
  const nonce      = await hkdfExpand(prkContent, new TextEncoder().encode('Content-Encoding: nonce\x00'), 12);

  // 6. Chiffrement AES-128-GCM
  const cekKey  = await crypto.subtle.importKey('raw', cek, { name: 'AES-GCM' }, false, ['encrypt']);
  const padded  = new Uint8Array([...new TextEncoder().encode(plaintext), 0x02]); // délimiteur padding
  const enc     = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce, tagLength: 128 }, cekKey, padded);

  // 7. Header aes128gcm : salt(16) + rs(4 BE) + idlen(1) + server_pub(65)
  const header  = new Uint8Array(86);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, 4096, false); // rs big-endian
  header[20] = 65;                                         // idlen
  header.set(srvPubRaw, 21);

  const result = new Uint8Array(header.length + enc.byteLength);
  result.set(header, 0);
  result.set(new Uint8Array(enc), header.length);
  return result;
}

// ── Signature VAPID JWT (ECDSA P-256) ────────────────────────

async function makeVapidAuth(privB64, pubB64, endpoint, subject) {
  const pub = b64urlToBytes(pubB64);
  const x   = bytesToB64url(pub.slice(1, 33));
  const y   = bytesToB64url(pub.slice(33, 65));

  const key = await crypto.subtle.importKey(
    'jwk', { kty: 'EC', crv: 'P-256', d: privB64, x, y },
    { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']
  );

  const { origin } = new URL(endpoint);
  const now = Math.floor(Date.now() / 1000);
  const h   = jsonToB64url({ typ: 'JWT', alg: 'ES256' });
  const p   = jsonToB64url({ aud: origin, exp: now + 43200, sub: subject });
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, new TextEncoder().encode(`${h}.${p}`));

  return { jwt: `${h}.${p}.${bytesToB64url(new Uint8Array(sig))}`, pubKey: pubB64 };
}

// ── Envoi d'une notification push ────────────────────────────

async function sendPush(subscription, payload, env) {
  const { endpoint, keys } = subscription;
  const { jwt, pubKey } = await makeVapidAuth(
    env.VAPID_PRIVATE_KEY, env.VAPID_PUBLIC_KEY, endpoint, env.VAPID_SUBJECT
  );

  let body        = null;
  let extraHeaders = {};

  if (keys?.p256dh && keys?.auth && payload) {
    // Chiffrement RFC 8291 pour Chrome/FCM
    body = await encryptPayload(JSON.stringify(payload), keys.p256dh, keys.auth);
    extraHeaders = {
      'Content-Type':     'application/octet-stream',
      'Content-Encoding': 'aes128gcm',
    };
  }

  const resp = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Authorization': `vapid t=${jwt},k=${pubKey}`,
      'TTL':           '86400',
      'Urgency':       'normal',
      ...extraHeaders,
    },
    body,
  });

  return { ok: resp.ok, status: resp.status };
}

// ── Supabase REST helper ──────────────────────────────────────

async function sb(env, path, method = 'GET', body = null) {
  const r = await fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: {
      'apikey':        env.SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      'Content-Type':  'application/json',
      'Prefer':        'return=minimal',
    },
    body: body ? JSON.stringify(body) : null,
  });
  if (method === 'GET' && r.ok) return r.json();
  return { ok: r.ok, status: r.status };
}

// ── Extraire user_id depuis JWT Supabase ──────────────────────

function extractUid(authHeader) {
  try {
    const token   = authHeader?.replace('Bearer ', '');
    if (!token) return null;
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return payload.sub || null;
  } catch (_) { return null; }
}

// ── Handler principal ─────────────────────────────────────────

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function onRequest({ request, env }) {
  const method = request.method.toUpperCase();
  if (method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

  const ok  = (data, s = 200)  => new Response(JSON.stringify(data), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } });
  const err = (msg, s = 400)   => ok({ error: msg }, s);

  // ── GET → clé publique VAPID ──────────────────────────────
  if (method === 'GET') {
    if (!env.VAPID_PUBLIC_KEY) return err('VAPID_PUBLIC_KEY non configurée', 500);
    return ok({ publicKey: env.VAPID_PUBLIC_KEY });
  }

  if (method !== 'POST') return err('Méthode non supportée', 405);

  let body;
  try { body = await request.json(); } catch (_) { return err('JSON invalide'); }

  const action = body.action;

  // ── subscribe ─────────────────────────────────────────────
  if (action === 'subscribe') {
    const uid = extractUid(request.headers.get('Authorization'));
    if (!uid) return err('Non authentifié', 401);

    const sub = body.subscription;
    if (!sub?.endpoint) return err('subscription.endpoint manquant');

    // Supprimer l'ancien abonnement pour cet endpoint (idempotence)
    const encoded = encodeURIComponent(sub.endpoint);
    await sb(env, `push_subscriptions?endpoint=eq.${encoded}`, 'DELETE');

    const result = await sb(env, 'push_subscriptions', 'POST', {
      user_id:     uid,
      subscription: sub,
      endpoint:    sub.endpoint,
      preferences: body.preferences || {},
    });

    return ok({ ok: result.ok !== false });
  }

  // ── unsubscribe ───────────────────────────────────────────
  if (action === 'unsubscribe') {
    if (!body.endpoint) return err('endpoint manquant');
    await sb(env, `push_subscriptions?endpoint=eq.${encodeURIComponent(body.endpoint)}`, 'DELETE');
    return ok({ ok: true });
  }

  // ── send ─────────────────────────────────────────────────
  // Corps attendu par sw.js : { title, message, url, type, tag }
  if (action === 'send') {
    const { userId, title, message, url, type } = body;
    if (!userId || !title) return err('userId et title requis');

    const subs = await sb(env, `push_subscriptions?user_id=eq.${userId}&select=subscription`);
    if (!Array.isArray(subs) || subs.length === 0) return ok({ ok: true, sent: 0 });

    // Format aligné sur sw.js : data.message || data.body
    const payload = { title, message: message || '', url: url || '/', type: type || 'system' };
    let sent = 0;

    await Promise.allSettled(
      subs.map(async row => {
        const { ok: pushed, status } = await sendPush(row.subscription, payload, env);
        if (pushed) {
          sent++;
        } else if (status === 410 || status === 404) {
          // Abonnement expiré — nettoyer
          await sb(env, `push_subscriptions?endpoint=eq.${encodeURIComponent(row.subscription.endpoint)}`, 'DELETE');
        }
      })
    );

    return ok({ ok: true, sent });
  }

  return err(`Action inconnue : ${action}`);
}
