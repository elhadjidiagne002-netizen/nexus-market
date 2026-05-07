<<<<<<< HEAD
// ── NEXUS Market — Service Worker v6 ─────────────────────────────────────────
// Déployer à la racine du projet (même niveau qu'index.html et server.js).
//
// Changements v6 (VAPID push complet) :
//   - [FIX] push handler : data.message || data.body (champ backend = "message")
//   - [FIX] notificationclick : data.url stocké dans notification.data.url
//     (avant : data string brute → openWindow échouait silencieusement)
//   - [NOUVEAU] Icônes par type de notification (message, order, offer, dispute…)
//   - [NOUVEAU] actions "Ouvrir" / "Ignorer" dans la notification
//   - [NOUVEAU] tag + renotify : remplace les notifs du même type (pas d'empilement)
//   - [NOUVEAU] PUSH_NAVIGATE : notifie l'onglet React de naviguer sans reload
//   - [NOUVEAU] pushsubscriptionchange : renouvellement automatique d'abonnement
//   - [NOUVEAU] message SW_SKIP_WAITING (alias de SKIP_WAITING — rétro-compat)
//   - Tout le reste de v5 conservé : BYPASS_HOSTS, Background Sync, IndexedDB…

const CACHE_NAME = "nexus-v6"; // Incrémenté → force remplacement du cache v5
const PRECACHE   = ["/", "/index.html", "/sw.js"];

// ── Domaines à ne JAMAIS intercepter ─────────────────────────────────────────
// [FIX v5] "vercel.app" absent : l'app est sur Vercel, le cacher ici empêchait
// le SW de mettre en cache index.html et les assets → mode offline cassé.
const BYPASS_HOSTS = [
  "supabase.co",           // Supabase REST + Auth + Realtime
  "onrender.com",          // API NEXUS sur Render (legacy)
  "railway.app",           // API NEXUS sur Railway
  "up.railway.app",        // Railway preview URLs
  "emailjs.com",           // EmailJS
  "stripe.com",            // Stripe
  "googleapis.com",        // Google APIs
  "googletagmanager.com",  // GTM
  "analytics.google.com",  // GA4
  "cdnjs.cloudflare.com",  // CDN JS (React, etc.)
  "cdn.jsdelivr.net",      // Supabase SDK, EmailJS
  "unpkg.com",             // CDN
  "placehold.co",          // Images placeholder
  "imgbb.com",             // ImgBB uploads
  "sentry.io",             // Sentry monitoring
=======
// ── NEXUS Market — Service Worker v5 ─────────────────────────────────────────
// Déployer à la racine du projet (même niveau qu'index.html et server.js).
//
// Changements v4 :
//   - onrender.com ajouté aux BYPASS_HOSTS (API backend sur Render)
//   - cdn.jsdelivr.net ajouté (Supabase SDK, EmailJS)
//   - Background Sync : file d'attente des actions offline (panier, commandes)
//   - Message handler : rechargement de cache à la demande depuis l'app
//   - PRECACHE étendu : /sw.js lui-même pour les mises à jour propres
//
// Changements v5 :
//   - [FIX CRITIQUE] "vercel.app" supprimé de BYPASS_HOSTS — l'app est sur Vercel,
//     ce pattern empêchait le SW de mettre en cache index.html et les assets.
//     Les routes API (/api/*) restent exclues via BYPASS_PATHS.
//   - imgbb.com, sentry.io ajoutés aux BYPASS_HOSTS
//   - up.railway.app ajouté explicitement

const CACHE_NAME   = "nexus-v5"; // [FIX] Incrémenté pour forcer le rechargement (correction BYPASS_HOSTS)
const PRECACHE     = ["/", "/index.html", "/sw.js"];

// Domaines à ne JAMAIS intercepter (APIs et CDN externes uniquement)
// [FIX v5] "vercel.app" SUPPRIMÉ de cette liste : l'app elle-même est hébergée
// sur Vercel, donc interdire vercel.app empêchait le SW de mettre en cache
// index.html, les scripts et les assets → le mode offline ne fonctionnait jamais.
// Les routes API Vercel (/api/*) sont déjà exclues par BYPASS_PATHS ci-dessous.
const BYPASS_HOSTS = [
  "supabase.co",            // Supabase REST + Auth + Realtime
  "onrender.com",           // API NEXUS sur Render (legacy)
  "railway.app",            // API NEXUS sur Railway
  "up.railway.app",         // Railway preview URLs
  "emailjs.com",            // EmailJS
  "stripe.com",             // Stripe
  "googleapis.com",         // Google APIs
  "googletagmanager.com",   // GTM
  "analytics.google.com",   // GA4
  "cdnjs.cloudflare.com",   // CDN JS (React, etc.)
  "cdn.jsdelivr.net",       // Supabase SDK, EmailJS
  "unpkg.com",              // CDN
  "placehold.co",           // Images placeholder
  "imgbb.com",              // ImgBB uploads
  "sentry.io",              // Sentry monitoring
>>>>>>> c504ab8 (chore(frontend+database+functions+scripts+config): mise à jour 72 fichier(s) — 2026-05-07 06:43)
];

// ── Routes API à ne jamais mettre en cache ────────────────────────────────────
const BYPASS_PATHS = [
  "/api/",
  "/api/auth/",
  "/api/orders/",
  "/api/payments/",
  "/api/messages/stream", // SSE — jamais en cache
  "/api/auth/refresh",    // JWT refresh — toujours réseau
];

// ── Icônes par type de notification ──────────────────────────────────────────
const PUSH_ICONS = {
  message: "https://placehold.co/192x192/00853E/white?text=💬",
  order:   "https://placehold.co/192x192/00853E/white?text=🛒",
  offer:   "https://placehold.co/192x192/00853E/white?text=💰",
  dispute: "https://placehold.co/192x192/FFC300/white?text=⚠️",
  vendor:  "https://placehold.co/192x192/00853E/white?text=🏪",
  system:  "https://placehold.co/192x192/00853E/white?text=NX",
};
const PUSH_BADGE = "https://placehold.co/72x72/00853E/white?text=NX";

// ── Install ───────────────────────────────────────────────────────────────────
self.addEventListener("install", event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE))
      .catch(() => {})
  );
});

// ── Activate ──────────────────────────────────────────────────────────────────
self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
  self.clients.matchAll({ type: "window" }).then(cs =>
    cs.forEach(c => c.postMessage({ type: "SW_ACTIVATED", version: CACHE_NAME }))
  );
});

// ── Fetch : Network-first, fallback cache ─────────────────────────────────────
self.addEventListener("fetch", event => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (BYPASS_HOSTS.some(h => url.hostname.includes(h))) return;
  if (BYPASS_PATHS.some(p => url.pathname.startsWith(p))) return;

  event.respondWith(
    caches.open(CACHE_NAME).then(cache =>
      fetch(req)
        .then(res => {
          if (res && res.status === 200 && url.origin === self.location.origin) {
            cache.put(req, res.clone());
          }
          return res;
        })
        .catch(() =>
          cache.match(req).then(cached => cached || cache.match("/index.html"))
        )
    )
  );
});

// ── Message handler ───────────────────────────────────────────────────────────
self.addEventListener("message", event => {
  const { type } = event.data || {};

  // Mise à jour immédiate (alias rétro-compat)
  if (type === "SKIP_WAITING" || type === "SW_SKIP_WAITING") {
    self.skipWaiting();
  }

  // Vider le cache à la demande (ex: après déconnexion)
  if (type === "CLEAR_CACHE") {
    caches.delete(CACHE_NAME).then(() => {
      event.ports[0]?.postMessage({ ok: true });
    });
  }

  // Pré-cacher des URLs à la demande (ex: catalogue consulté)
  if (type === "CACHE_URLS") {
    const { urls } = event.data;
    if (Array.isArray(urls)) {
      caches.open(CACHE_NAME).then(cache => cache.addAll(urls).catch(() => {}));
    }
  }
});

// ── Background Sync : rejouer les actions offline ─────────────────────────────
self.addEventListener("sync", event => {
  if (event.tag === "nexus-cart-sync")  event.waitUntil(_replayQueue("nexus-cart-queue"));
  if (event.tag === "nexus-order-sync") event.waitUntil(_replayQueue("nexus-order-queue"));
});

async function _replayQueue(queueName) {
  try {
    const db    = await _openDB();
    const tx    = db.transaction(queueName, "readwrite");
    const store = tx.objectStore(queueName);
    const items = await _dbGetAll(store);

    for (const item of items) {
      try {
        const res = await fetch(item.url, {
          method:  item.method,
          headers: item.headers,
          body:    item.body,
        });
        if (res.ok) {
          await _dbDelete(store, item.id);
          self.clients.matchAll({ type: "window" }).then(cs =>
            cs.forEach(c => c.postMessage({ type: "SYNC_SUCCESS", tag: queueName, itemId: item.id }))
          );
        }
      } catch (_) {}
    }
    await _dbCommit(tx);
  } catch (_) {}
}

// Helpers IndexedDB
function _openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("nexus-sw-db", 1);
    req.onupgradeneeded = e => {
      const db = e.target.result;
      ["nexus-cart-queue", "nexus-order-queue"].forEach(name => {
        if (!db.objectStoreNames.contains(name))
          db.createObjectStore(name, { keyPath: "id", autoIncrement: true });
      });
    };
    req.onsuccess = e => resolve(e.target.result);
    req.onerror   = e => reject(e.target.error);
  });
}
function _dbGetAll(store) {
  return new Promise((resolve, reject) => {
    const req = store.getAll();
    req.onsuccess = e => resolve(e.target.result);
    req.onerror   = e => reject(e.target.error);
  });
}
function _dbDelete(store, id) {
  return new Promise((resolve, reject) => {
    const req = store.delete(id);
    req.onsuccess = () => resolve();
    req.onerror   = e => reject(e.target.error);
  });
}
function _dbCommit(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror    = e => reject(e.target.error);
  });
}

// ── Push notifications ────────────────────────────────────────────────────────
// [FIX v6] Le backend envoie { type, title, message, link } via web-push.
//   data.body  → absent dans le payload backend (était data.message)
//   data.url   → absent dans le payload backend (était data.link)
//   data.tag   → absent (était data.type)
// On normalise ici pour supporter les deux conventions.
self.addEventListener("push", event => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (_) {
    data = { title: "NEXUS Market", message: event.data ? event.data.text() : "" };
  }

  const title = data.title   || "NEXUS Market";
  const body  = data.message || data.body || "Vous avez une nouvelle notification.";
  const link  = data.link    || data.url  || "/";
  const type  = data.type    || data.tag  || "system";
  const icon  = data.icon    || PUSH_ICONS[type] || PUSH_ICONS.system;

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon,
      badge:    data.badge || PUSH_BADGE,
      vibrate:  [200, 100, 200],
      tag:      type,       // Remplace les notifs du même type (pas d'empilement)
      renotify: true,       // Vibre quand même si tag identique
      data:     { url: link, type },
      actions: [
        { action: "open",    title: "Ouvrir" },
        { action: "dismiss", title: "Ignorer" },
      ],
    })
  );
});

// ── Notification click ────────────────────────────────────────────────────────
// [FIX v6] notification.data est maintenant un objet { url, type }
//   (avant : data était une string brute → clients.openWindow(string) pouvait
//    passer "/" au lieu du lien réel si le payload utilisait data.link)
self.addEventListener("notificationclick", event => {
  event.notification.close();
  if (event.action === "dismiss") return;

  // Compatibilité : data peut être string (v5) ou objet { url } (v6)
  const target = (typeof event.notification.data === "object")
    ? (event.notification.data?.url || "/")
    : (event.notification.data      || "/");

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(cs => {
      // Chercher un onglet NEXUS déjà ouvert → le focaliser + naviguer
      const nexus = cs.find(c => new URL(c.url).origin === self.location.origin);
      if (nexus) {
        nexus.focus();
        // Envoyer PUSH_NAVIGATE pour que React route sans reload complet
        nexus.postMessage({ type: "PUSH_NAVIGATE", url: target });
        return;
      }
      return self.clients.openWindow(target);
    })
  );
});

<<<<<<< HEAD
// ── Pushsubscriptionchange ────────────────────────────────────────────────────
// [NOUVEAU v6] Le navigateur invalide parfois l'abonnement (expiration clé, etc.)
// On renouvelle automatiquement et on notifie l'app pour qu'elle re-soumette
// le nouvel abonnement au backend (/api/push/subscribe).
self.addEventListener("pushsubscriptionchange", event => {
  event.waitUntil(
    self.registration.pushManager.subscribe({
      userVisibleOnly:      true,
      applicationServerKey: event.oldSubscription?.options?.applicationServerKey,
    })
    .then(newSub =>
      self.clients.matchAll({ type: "window" }).then(cs =>
        cs.forEach(c =>
          c.postMessage({ type: "PUSH_SUBSCRIPTION_RENEWED", subscription: newSub.toJSON() })
        )
      )
    )
    .catch(err => console.error("[SW] pushsubscriptionchange — échec renouvellement :", err))
  );
});
=======
// [NEXUS-F4] web-push VAPID [SW]
// sw.js déjà configuré avec handlers push natifs — aucune modification requise.

// [v5] Note : après déploiement, vider le cache navigateur ou attendre que le SW
// v5 remplace le v4. Le nouveau SW sera automatiquement activé à la prochaine
// visite (skipWaiting est déjà configuré).
>>>>>>> c504ab8 (chore(frontend+database+functions+scripts+config): mise à jour 72 fichier(s) — 2026-05-07 06:43)
