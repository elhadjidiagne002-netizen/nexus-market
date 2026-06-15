/**
 * functions/push-send.js
 * POST /push-send – Envoie des notifications Web Push (VAPID + RFC 8291)
 */
import { createClient } from "@supabase/supabase-js";

// Helpers base64url
const b64ToBytes = str => {
  const base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - base64.length % 4) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, c => c.charCodeAt(0));
};

// [FIX] Remplacement de btoa(String.fromCharCode(...bytes)) qui provoque
// un "Maximum call stack size exceeded" sur de grands tableaux (payload
// chiffré > ~65k octets). On construit la chaîne caractère par caractère.
const bytesToB64 = bytes => {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
};

const concat = (...arrays) => {
  const total = arrays.reduce((s, a) => s + a.length, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const a of arrays) { result.set(a, offset); offset += a.length; }
  return result;
};

// VAPID JWT
async function createVapidJWT(endpoint, publicKeyB64, privateKeyB64, subject) {
  const { origin } = new URL(endpoint);
  const header = { typ: "JWT", alg: "ES256" };
  const payload = {
    aud: origin,
    exp: Math.floor(Date.now() / 1000) + 43200,
    sub: subject,
  };
  const encode = o => bytesToB64(new TextEncoder().encode(JSON.stringify(o)));
  const sigInput = `${encode(header)}.${encode(payload)}`;

  const pubBytes = b64ToBytes(publicKeyB64);
  const jwk = {
    kty: "EC",
    crv: "P-256",
    x: bytesToB64(pubBytes.slice(1, 33)),
    y: bytesToB64(pubBytes.slice(33, 65)),
    d: privateKeyB64,
    ext: true,
  };
  const key = await crypto.subtle.importKey("jwk", jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, new TextEncoder().encode(sigInput));
  return `${sigInput}.${bytesToB64(new Uint8Array(sig))}`;
}

// Chiffrement payload (aes128gcm / RFC 8291)
async function encryptPayload(p256dhB64, authB64, plaintext) {
  const receiverPub = b64ToBytes(p256dhB64);
  const auth = b64ToBytes(authB64);
  const plainBytes = new TextEncoder().encode(plaintext);

  const senderKeyPair = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const receiverKey = await crypto.subtle.importKey("raw", receiverPub, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const sharedBits = await crypto.subtle.deriveBits({ name: "ECDH", public: receiverKey }, senderKeyPair.privateKey, 256);

  const senderPubBytes = new Uint8Array(await crypto.subtle.exportKey("raw", senderKeyPair.publicKey));
  const salt = crypto.getRandomValues(new Uint8Array(16));

  const hkdf = async (ikm, salt, info, length) => {
    const ikmKey = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
    return new Uint8Array(await crypto.subtle.deriveBits(
      { name: "HKDF", hash: "SHA-256", salt, info },
      ikmKey, length * 8
    ));
  };

  const context = concat(
    new TextEncoder().encode("WebPush: info\x00"),
    receiverPub,
    senderPubBytes
  );
  const ikm = await hkdf(new Uint8Array(sharedBits), auth, context, 32);
  const cek = await hkdf(ikm, salt, new TextEncoder().encode("Content-Encoding: aes128gcm\x00"), 16);
  const nonce = await hkdf(ikm, salt, new TextEncoder().encode("Content-Encoding: nonce\x00"), 12);

  const padded = concat(plainBytes, new Uint8Array([0x02]));
  const cekKey = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, cekKey, padded));

  const rs = new Uint8Array(4);
  new DataView(rs.buffer).setUint32(0, 4096, false);
  return concat(salt, rs, new Uint8Array([senderPubBytes.length]), senderPubBytes, cipher);
}

async function sendNotification(sub, payload, publicKey, privateKey, email) {
  const jwt = await createVapidJWT(sub.endpoint, publicKey, privateKey, email);
  const body = await encryptPayload(sub.p256dh, sub.auth, payload);

  const res = await fetch(sub.endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Encoding": "aes128gcm",
      "Authorization": `vapid t=${jwt},k=${publicKey}`,
      "TTL": "86400",
    },
    body,
  });

  if (res.status === 410 || res.status === 404) {
    const err = new Error("Expired");
    err.statusCode = res.status;
    throw err;
  }
  if (!res.ok && res.status !== 201) {
    const err = new Error(`Push failed: ${res.status}`);
    err.statusCode = res.status;
    throw err;
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;

  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
  const json = (status, body) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });

  const {
    SUPABASE_URL, SUPABASE_SERVICE_KEY,
    VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY,
    VAPID_EMAIL = "mailto:nx@nexusmarket.sn",
  } = env;

  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY || !SUPABASE_SERVICE_KEY) {
    return json(503, { error: "Config VAPID/Supabase manquante" });
  }

  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // [SEC #6] Identité de l'appelant :
  //   · appel SERVEUR→SERVEUR (webhooks, cron) → en-tête X-Internal-Secret ;
  //   · sinon JWT Supabase vérifié (signature) → on en déduit l'uid + le rôle.
  // L'ancien code n'exigeait AUCUNE auth pour un envoi ciblé (userId) : n'importe
  // qui pouvait pousser une notif « ✅ Paiement confirmé » avec une url malveillante.
  // Repli robuste sur SUPABASE_SERVICE_KEY (toujours côté serveur, jamais client).
  const INTERNAL_SECRET = env.INTERNAL_API_SECRET || env.CRON_SECRET || SUPABASE_SERVICE_KEY || "";
  const isInternal = !!INTERNAL_SECRET && (request.headers.get("X-Internal-Secret") || "") === INTERNAL_SECRET;

  let callerUid = null, isAdmin = false;
  if (!isInternal) {
    const auth = request.headers.get("Authorization") || "";
    if (!auth.startsWith("Bearer ")) return json(401, { error: "Non authentifié" });
    const { data: { user } } = await sb.auth.getUser(auth.slice(7))
      .catch(() => ({ data: { user: null } }));
    if (!user) return json(401, { error: "Token invalide" });
    callerUid = user.id;
    const { data: profile } = await sb.from("profiles").select("role").eq("id", user.id).maybeSingle();
    isAdmin = profile?.role === "admin";
  }

  let body;
  try { body = await request.json(); } catch { return json(400, { error: "JSON invalide" }); }

  const { userId, title, body: msgBody, url = "/", icon, badge, toAll = false } = body;
  if (!title || !msgBody) return json(400, { error: "title et body requis" });

  // [SEC #6] Autorisation : interne/admin peut tout ; un utilisateur normal ne
  // peut notifier QUE lui-même (pas de spoofing vers un autre userId).
  if (!isInternal && !isAdmin) {
    if (toAll) return json(403, { error: "Admin only" });
    if (!userId || String(userId) !== String(callerUid)) return json(403, { error: "Envoi autorisé vers soi-même uniquement" });
  }

  let query = sb.from("push_subscriptions").select("endpoint, p256dh, auth");
  if (!toAll && userId) query = query.eq("user_id", userId);
  const { data: subs, error: dbErr } = await query;

  if (dbErr) return json(500, { error: dbErr.message });
  if (!subs?.length) return json(200, { sent: 0, message: "Aucun abonné" });

  const payload = JSON.stringify({
    title, body: msgBody, url,
    icon: icon || "https://placehold.co/192x192/00853E/white?text=NX",
    badge: badge || "https://placehold.co/72x72/00853E/white?text=NX",
  });

  const stale = [];
  const results = await Promise.allSettled(
    subs.map(sub =>
      sendNotification(sub, payload, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_EMAIL)
        .catch(err => {
          if (err.statusCode === 410 || err.statusCode === 404) stale.push(sub.endpoint);
          throw err;
        })
    )
  );

  if (stale.length) {
    context.waitUntil(
      sb.from("push_subscriptions").delete().in("endpoint", stale)
    );
  }

  const sent = results.filter(r => r.status === "fulfilled").length;
  const failed = results.filter(r => r.status === "rejected").length;
  console.log(`[push-send] sent=${sent} failed=${failed} stale=${stale.length}`);
  return json(200, { sent, failed, staleRemoved: stale.length });
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}
