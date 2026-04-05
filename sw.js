// ═══════════════════════════════════════════════════════════════════════════
// GasTon 360 — sw.js  (Service Worker PWA)
// À placer dans : public/sw.js
//
// FIX : remplace l'enregistrement via blob: URL par un vrai fichier physique
// FIX : skipWaiting() appelé en premier pour éviter les locks orphelins
// ═══════════════════════════════════════════════════════════════════════════

const CACHE_NAME    = 'gaston360-v2';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icons/icon-192x192.png',
];

// ── Installation : mise en cache des assets statiques ─────────────────────
self.addEventListener('install', (event) => {
  console.log('[SW] Installation...');
  // skipWaiting() EN PREMIER — évite les locks orphelins Supabase gotrue-js
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        console.warn('[SW] Certains assets non mis en cache :', err);
      });
    })
  );
});

// ── Activation : suppression des anciens caches ───────────────────────────
self.addEventListener('activate', (event) => {
  console.log('[SW] Activation...');
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => {
            console.log('[SW] Suppression cache obsolète :', key);
            return caches.delete(key);
          })
      )
    ).then(() => self.clients.claim())
  );
});

// ── Fetch : stratégie Network First pour les API, Cache First pour les assets
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Ne pas intercepter les requêtes non-GET
  if (request.method !== 'GET') return;

  // Ne pas intercepter les requêtes API (Supabase, Stripe, etc.)
  if (
    url.pathname.startsWith('/api/') ||
    url.hostname.includes('supabase.co') ||
    url.hostname.includes('stripe.com') ||
    url.hostname.includes('resend.com') ||
    url.hostname.includes('emailjs.com') ||
    url.hostname.includes('googleapis.com')
  ) {
    return; // Laisser passer — pas de cache pour les API
  }

  // Cache First pour les assets statiques
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request)
        .then((response) => {
          // Mettre en cache les réponses valides
          if (response && response.status === 200 && response.type === 'basic') {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => {
          // Fallback hors-ligne : renvoyer index.html
          if (request.destination === 'document') {
            return caches.match('/index.html');
          }
        });
    })
  );
});
