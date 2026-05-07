/**
 * functions/push-send.js
 * ──────────────────────────────────────────────────────────────────────────
 * POST /push-send → Envoie des notifications Web Push via VAPID
 *
 * ✅ Zéro dépendance Node.js — implémentation native Web Crypto API.
 *    Le package `web-push` est supprimé. Tout fonctionne avec les APIs
 *    standards disponibles dans tous les Cloudflare Workers sans aucun flag.
 *
 * Implémente :
 *   • VAPID JWT (ECDSA P-256, RFC 8292)
 *   • Chiffrement payload (ECDH + HKDF + AES-128-GCM, RFC 8291)
 *
 * Variables d'environnement Cloudflare :
 *   SUPABASE_URL         — URL Supabase
 *   SUPABASE_SERVICE_KEY — Clé service_role
 *   VAPID_PUBLIC_KEY     — Clé VAPID publique  (base64url, 65 octets)
 *   VAPID_PRIVATE_KEY    — Clé VAPID privée    (base64url, 32 octets)
 *   VAPID_EMAIL          — ex: mailto:admin@nexus-market.com
 */

import { createClient } from "@supabase/supabase-js";

// ══════════════════════════════════════════════════════════════════════════════
// Helpers base64url / binaire
// ══════════════════════════════════════════════════════════════════════════════

function b64urlToBytes(str) {
  const base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  const padded  = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const binary  = atob(padded);
  return Uint8Array.from(binary, c => c.charCodeAt(0));
}

function bytesToB64url(bytes) {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

function concat(...arrays) {
  const total  = arrays.reduce((s, a) => s + a.length, 0);
  const result = new Uint8Array(total);
  let offset   = 0;
  for (const a of arrays) { result.set(a, offset); offset += a.length; }
  return result;
}

const encoder = new TextEncoder();
const encode  = s => encoder.encode(s);

// ══════════════════════════════════════════════════════════════════════════════
// VAPID JWT — RFC 8292
// ══════════════════════════════════════════════════════════════════════════════

async function createVapidJWT(endpoint, publicKeyB64, privateKeyB64, subject) {
  const { origin } = new URL(endpoint);

  // Header et payload JWT
  const header  = { typ: "JWT", alg: "ES256" };
  const payload = {
    aud: origin,
    exp: Math.floor(Date.now() / 1000) + 43200, // 12h
    sub: subject,
  };

  const encodeObj  = o => bytesToB64url(encode(JSON.stringify(o)));
  const sigInput   = `${encodeObj(header)}.${encodeObj(payload)}`;

  // Convertir la clé privée VAPID (raw P-256) en JWK pour Web Crypto
  const pubBytes = b64urlToBytes(publicKeyB64);
  const jwk = {
    kty:     "EC",
    crv:     "P-256",
    x:       bytesToB64url(pubBytes.slice(1, 33)),
    y:       bytesToB64url(pubBytes.slice(33, 65)),
    d:       privateKeyB64,
    key_ops: ["sign"],
    ext:     true,
  };

  const sigKey = await crypto.subtle.importKey(
    "jwk", jwk,
    { name: "ECDSA", namedCurve: "P-256" },
    false, ["sign"]
  );

  const sig = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    sigKey,
    encode(sigInput)
  );

  return `${sigInput}.${bytesToB64url(new Uint8Array(sig))}`;
}

// ══════════════════════════════════════════════════════════════════════════════
// Chiffrement payload — RFC 8291 (aes128gcm)
// ══════════════════════════════════════════════════════════════════════════════

async function encryptPayload(p256dhB64, authB64, plaintext) {
  const receiverPubBytes = b64urlToBytes(p256dhB64);
  const authBytes        = b64urlToBytes(authB64);
  const plaintextBytes   = encode(plaintext);

  // 1. Générer la paire de clés ECDH éphémère côté serveur
  const senderKeyPair = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]
  );

  // 2. Importer la clé publique du destinataire
  const receiverKey = await crypto.subtle.importKey(
    "raw", receiverPubBytes,
    { name: "ECDH", namedCurve: "P-256" },
    false, []
  );

  // 3. Secret partagé ECDH (256 bits)
  const sharedBits = await crypto.subtle.deriveBits(
    { name: "ECDH", public: receiverKey },
    senderKeyPair.privateKey, 256
  );

  // 4. Exporter la clé publique éphémère (non compressée, 65 octets)
  const senderPubBytes = new Uint8Array(
    await crypto.subtle.exportKey("raw", senderKeyPair.publicKey)
  );

  // 5. Salt aléatoire (16 octets)
  const salt = crypto.getRandomValues(new Uint8Array(16));

  // ── HKDF helper ─────────────────────────────────────────────────────────
  const hkdfDerive = async (ikmBytes, saltBytes, infoBytes, length) => {
    const ikmKey = await crypto.subtle.importKey(
      "raw", ikmBytes, "HKDF", false, ["deriveBits"]
    );
    return new Uint8Array(await crypto.subtle.deriveBits(
      { name: "HKDF", hash: "SHA-256", salt: saltBytes, info: infoBytes },
      ikmKey, length * 8
    ));
  };

  // 6. PRK : HKDF-Extract(salt=auth, ikm=sharedSecret)  [RFC 8291 §3.3]
  const context = concat(
    encode("WebPush: info\x00"),
    receiverPubBytes,
    senderPubBytes
  );
  const ikm = await hkdfDerive(new Uint8Array(sharedBits), authBytes, context, 32);

  // 7. CEK (16 octets) et nonce (12 octets) via HKDF avec le salt aléatoire
  const cekBytes   = await hkdfDerive(ikm, salt, encode("Content-Encoding: aes128gcm\x00"), 16);
  const nonceBytes = await hkdfDerive(ikm, salt, encode("Content-Encoding: nonce\x00"),    12);

  // 8. Chiffrement AES-128-GCM
  // Padding : ajouter 0x02 (delimiter) + au moins 1 octet de padding
  const padded  = concat(plaintextBytes, new Uint8Array([0x02]));
  const cekKey  = await crypto.subtle.importKey("raw", cekBytes, "AES-GCM", false, ["encrypt"]);
  const cipher  = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonceBytes }, cekKey, padded)
  );

  // 9. Construire l'enregistrement RFC 8188
  //    Header = salt(16) + rs(4, big-endian) + idlen(1) + senderPub(65)
  const rs = new Uint8Array(4);
  new DataView(rs.buffer).setUint32(0, 4096, false);

  return concat(salt, rs, new Uint8Array([senderPubBytes.length]), senderPubBytes, cipher);
}

// ══════════════════════════════════════════════════════════════════════════════
// Envoi d'une notification push
// ══════════════════════════════════════════════════════════════════════════════

async function sendPush(sub, payloadStr, vapidPublicKey, vapidPrivateKey, vapidEmail) {
  const { endpoint, p256dh, auth_key } = sub;

  const [jwt, body] = await Promise.all([
    createVapidJWT(endpoint, vapidPublicKey, vapidPrivateKey, vapidEmail),
    encryptPayload(p256dh, auth_key, payloadStr),
  ]);

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type":     "application/octet-stream",
      "Content-Encoding": "aes128gcm",
      "Authorization":    `vapid t=${jwt},k=${vapidPublicKey}`,
      "TTL":              "86400",
    },
    body,
  });

  // 201 = succès, 410/404 = abonnement expiré
  if (!res.ok && res.status !== 201) {
    const err      = new Error(`Push HTTP ${res.status}`);
    err.statusCode = res.status;
    throw err;
  }
  return res;
}

// ══════════════════════════════════════════════════════════════════════════════
// Helpers CORS / JSON
// ══════════════════════════════════════════════════════════════════════════════

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin":  "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}
function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders() },
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// Handler principal
// ══════════════════════════════════════════════════════════════════════════════

export async function onRequestPost(context) {
  const { request, env } = context;

  const {
    SUPABASE_URL, SUPABASE_SERVICE_KEY,
    VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY,
    VAPID_EMAIL = "mailto:admin@nexus-market.com",
  } = env;

  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY || !SUPABASE_SERVICE_KEY) {
    return json(503, { error: "Variables d'env VAPID ou Supabase manquantes" });
  }

  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // ── Vérifier le token (admin requis pour toAll) ───────────────────────────
  const authHeader = request.headers.get("authorization") || "";
  let callerRole   = null;
  if (authHeader.startsWith("Bearer ")) {
    const { data: { user } } = await sb.auth.getUser(authHeader.slice(7))
      .catch(() => ({ data: {} }));
    callerRole = user?.user_metadata?.role || null;
  }

  let payload;
  try   { payload = await request.json(); }
  catch { return json(400, { error: "JSON invalide" }); }

  const { userId, title, body, url = "/", icon, badge, toAll = false } = payload;

  if (!title || !body) return json(400, { error: "title et body requis" });
  if (toAll && callerRole !== "admin") return json(403, { error: "Réservé aux admins" });

  // ── Récupérer les abonnements ─────────────────────────────────────────────
  let query = sb.from("push_subscriptions").select("endpoint, p256dh, auth_key");
  if (!toAll && userId) query = query.eq("user_id", userId);
  const { data: subs, error: dbErr } = await query;

  if (dbErr) return json(500, { error: dbErr.message });
  if (!subs || subs.length === 0) return json(200, { sent: 0, message: "Aucun abonné" });

  // ── Payload de la notification ────────────────────────────────────────────
  const notification = JSON.stringify({
    title, body, url,
    icon:  icon  || "https://placehold.co/192x192/00853E/white?text=NX",
    badge: badge || "https://placehold.co/72x72/00853E/white?text=NX",
  });

  // ── Envoi en parallèle ────────────────────────────────────────────────────
  const staleEndpoints = [];

  const results = await Promise.allSettled(
    subs.map(sub =>
      sendPush(sub, notification, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_EMAIL)
        .catch(err => {
          if (err.statusCode === 410 || err.statusCode === 404) {
            staleEndpoints.push(sub.endpoint);
          }
          throw err;
        })
    )
  );

  // Nettoyer les abonnements expirés
  if (staleEndpoints.length > 0) {
    context.waitUntil(
      sb.from("push_subscriptions").delete().in("endpoint", staleEndpoints)
    );
  }

  const sent   = results.filter(r => r.status === "fulfilled").length;
  const failed = results.filter(r => r.status === "rejected").length;

  console.log(`[push-send] sent=${sent} failed=${failed} stale=${staleEndpoints.length}`);
  return json(200, { sent, failed, staleRemoved: staleEndpoints.length });
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: corsHeaders() });
}
