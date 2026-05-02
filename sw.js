// ── NEXUS Market — Service Worker v4 ─────────────────────────────────────────
// Déployer à la racine du projet (même niveau qu'index.html et server.js).
//
// Changements v4 :
//   - onrender.com ajouté aux BYPASS_HOSTS (API backend sur Render)
//   - cdn.jsdelivr.net ajouté (Supabase SDK, EmailJS)
//   - Background Sync : file d'attente des actions offline (panier, commandes)
//   - Message handler : rechargement de cache à la demande depuis l'app
//   - PRECACHE étendu : /sw.js lui-même pour les mises à jour propres

const CACHE_NAME   = "nexus-v4";
const PRECACHE     = ["/", "/index.html", "/sw.js"];

// Domaines à ne JAMAIS intercepter (API, analytics, CDN externes)
const BYPASS_HOSTS = [
  "supabase.co",
  "onrender.com",           // [v4] API NEXUS sur Render
  "railway.app",
  "vercel.app",
  "emailjs.com",
  "stripe.com",
  "googleapis.com",
  "googletagmanager.com",
  "analytics.google.com",
  "cdnjs.cloudflare.com",
  "cdn.jsdelivr.net",       // [v4] Supabase SDK, EmailJS
  "unpkg.com",
  "placehold.co",
];

// Routes API à ne jamais mettre en cache (données temps-réel)
const BYPASS_PATHS = [
  "/api/",
  "/api/auth/",
  "/api/orders/",
  "/api/payments/",
  "/api/messages/stream", // SSE — ne jamais mettre en cache
  "/api/auth/refresh",    // JWT refresh — toujours réseau
];

// ── Install : précache les ressources essentielles ───────────────────────────
self.addEventListener("install", event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE))
      .catch(() => { /* ignore les erreurs de précache */ })
  );
});

// ── Activate : supprimer les anciens caches ──────────────────────────────────
self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
  // Notifier tous les onglets que le SW a été mis à jour
  self.clients.matchAll({ type: "window" }).then(clients => {
    clients.forEach(c => c.postMessage({ type: "SW_ACTIVATED", version: CACHE_NAME }));
  });
});

// ── Fetch : stratégie Network-first avec fallback cache ──────────────────────
self.addEventListener("fetch", event => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // Bypass : domaines externes
  if (BYPASS_HOSTS.some(h => url.hostname.includes(h))) return;

  // Bypass : routes API et temps-réel
  if (BYPASS_PATHS.some(p => url.pathname.startsWith(p))) return;

  event.respondWith(
    caches.open(CACHE_NAME).then(cache =>
      fetch(req)
        .then(networkRes => {
          // Mettre en cache uniquement les réponses 200 de la même origine
          if (networkRes && networkRes.status === 200 && url.origin === self.location.origin) {
            cache.put(req, networkRes.clone());
          }
          return networkRes;
        })
        .catch(() =>
          // Réseau indisponible → fallback cache → fallback SPA /index.html
          cache.match(req).then(cached => cached || cache.match("/index.html"))
        )
    )
  );
});

// ── Message handler : actions depuis l'app ───────────────────────────────────
// [v4] Permet à l'app de déclencher un rechargement de cache ou de forcer update
self.addEventListener("message", event => {
  const { type } = event.data || {};

  if (type === "SKIP_WAITING") {
    // Appelé depuis l'app quand l'utilisateur accepte la mise à jour
    self.skipWaiting();
  }

  if (type === "CLEAR_CACHE") {
    // Vider le cache à la demande (ex: après déconnexion)
    caches.delete(CACHE_NAME).then(() => {
      event.ports[0]?.postMessage({ ok: true });
    });
  }

  if (type === "CACHE_URLS") {
    // Précacher une liste d'URLs à la demande (ex: catalogue produits consulté)
    const { urls } = event.data;
    if (Array.isArray(urls)) {
      caches.open(CACHE_NAME).then(cache => cache.addAll(urls).catch(() => {}));
    }
  }
});

// ── Background Sync : rejouer les actions échouées en offline ─────────────────
// [v4] Quand la connexion revient, les requêtes en attente sont rejouées
self.addEventListener("sync", event => {
  if (event.tag === "nexus-cart-sync") {
    event.waitUntil(_replayQueue("nexus-cart-queue"));
  }
  if (event.tag === "nexus-order-sync") {
    event.waitUntil(_replayQueue("nexus-order-queue"));
  }
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
          self.clients.matchAll({ type: "window" }).then(clients =>
            clients.forEach(c => c.postMessage({
              type: "SYNC_SUCCESS", tag: queueName, itemId: item.id,
            }))
          );
        }
      } catch (_) { /* laisser en file pour le prochain sync */ }
    }
    await _dbCommit(tx);
  } catch (_) { /* IndexedDB non disponible — ignorer silencieusement */ }
}

// Helpers IndexedDB légers
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
self.addEventListener("push", event => {
  const data = event.data ? event.data.json() : {};
  event.waitUntil(
    self.registration.showNotification(data.title || "NEXUS Market", {
      body:    data.body  || "Vous avez une nouvelle notification.",
      icon:    data.icon  || "https://placehold.co/192x192/00853E/white?text=NX",
      badge:   data.badge || "https://placehold.co/72x72/00853E/white?text=NX",
      data:    data.url   || "/",
      vibrate: [200, 100, 200],
      tag:     data.tag   || "nexus-notif",
    })
  );
});

// ── Notification click ────────────────────────────────────────────────────────
self.addEventListener("notificationclick", event => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then(clientList => {
      const target   = event.notification.data || "/";
      const existing = clientList.find(c => c.url.includes(target) && "focus" in c);
      return existing ? existing.focus() : clients.openWindow(target);
    })
  );
});

// [NEXUS-F4] web-push VAPID [SW]
// sw.js déjà configuré avec handlers push natifs — aucune modification requise.
