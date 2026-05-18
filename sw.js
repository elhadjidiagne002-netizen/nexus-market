/**
 * NEXUS Market — Service Worker v1.0.0
 *
 * Stratégie :
 *  - HTML (index.html) : network-first (fallback cache si offline)
 *  - Assets statiques  : cache-first
 *  - API /api/*        : network-only (jamais en cache)
 *  - Supabase REST     : network-only
 */

const CACHE_VERSION = 'nexus-v1.0.0';
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;

// Liste minimale à pré-cacher (le reste se cache à la volée)
const PRECACHE_URLS = ['/'];

// ── Install ──────────────────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then(cache => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
      .catch(err => console.warn('[SW] Precache failed:', err))
  );
});

// ── Activate : nettoyer les anciens caches ───────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(k => !k.startsWith(CACHE_VERSION))
          .map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// ── Fetch : stratégie par type de requête ────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Ignorer les requêtes non-GET et cross-origin (sauf Supabase/CDN)
  if (request.method !== 'GET') return;

  // ── /api/* → network-only, jamais en cache ──────────────────────────
  if (url.pathname.startsWith('/api/')) {
    return; // Laisser le navigateur gérer
  }

  // ── Supabase, EmailJS, GA → network-only ────────────────────────────
  if (url.hostname.endsWith('.supabase.co') ||
      url.hostname.includes('emailjs.com') ||
      url.hostname.includes('google-analytics.com') ||
      url.hostname.includes('googletagmanager.com')) {
    return;
  }

  // ── HTML (navigation) → network-first ───────────────────────────────
  if (request.mode === 'navigate' || request.destination === 'document') {
    event.respondWith(
      fetch(request)
        .then(res => {
          // Cloner pour cache
          const clone = res.clone();
          caches.open(RUNTIME_CACHE).then(c => c.put(request, clone));
          return res;
        })
        .catch(() => caches.match(request).then(r => r || caches.match('/')))
    );
    return;
  }

  // ── Assets (JS, CSS, images, fonts) → cache-first ───────────────────
  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached;
      return fetch(request).then(res => {
        if (res.ok && res.status === 200) {
          const clone = res.clone();
          caches.open(RUNTIME_CACHE).then(c => c.put(request, clone));
        }
        return res;
      });
    })
  );
});

// ── Messages depuis la page (skipWaiting au demande) ─────────────────────
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
