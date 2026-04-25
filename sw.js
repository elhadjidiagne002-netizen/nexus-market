// ── NEXUS Market — Service Worker v3 ─────────────────────────────────────────
// Fichier à déployer à la racine de votre projet Vercel (même niveau qu'index.html).
// Le SW doit être servi depuis la même origine que la page pour être enregistrable.

const CACHE_NAME = "nexus-v3";
const PRECACHE   = ["/", "/index.html"];

// Domaines à ne JAMAIS intercepter (API, analytics, CDN externes)
const BYPASS_HOSTS = [
  "supabase.co",
  "railway.app",
  "vercel.app",       // les routes /api/* sur Vercel
  "emailjs.com",
  "stripe.com",
  "googleapis.com",
  "googletagmanager.com",
  "analytics.google.com",
  "cdnjs.cloudflare.com",
  "unpkg.com",
  "placehold.co",
];

// ── Install : précache les ressources essentielles ───────────────────────────
self.addEventListener("install", event => {
  self.skipWaiting(); // activer immédiatement sans attendre l'onglet fermé
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
      .then(() => self.clients.claim()) // contrôler tous les onglets ouverts
  );
  self.clients.matchAll({ type: "window" }).then(clients => {
    clients.forEach(c => c.postMessage({ type: "SW_ACTIVATED", version: CACHE_NAME }));
  });
});

// ── Fetch : stratégie Network-first avec fallback cache ──────────────────────
self.addEventListener("fetch", event => {
  const req = event.request;
  if (req.method !== "GET") return; // ne pas intercepter POST/PATCH/DELETE

  const url = new URL(req.url);

  // Bypass : domaines externes et routes API
  if (BYPASS_HOSTS.some(h => url.hostname.includes(h))) return;
  if (url.pathname.startsWith("/api/")) return;

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
          // Réseau indisponible → fallback cache → fallback /index.html (SPA)
          cache.match(req).then(cached => cached || cache.match("/index.html"))
        )
    )
  );
});

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
      const target = event.notification.data || "/";
      const existing = clientList.find(c => c.url.includes(target) && "focus" in c);
      return existing ? existing.focus() : clients.openWindow(target);
    })
  );
});
