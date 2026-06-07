// functions/_lib/edgecache.js
// Cache au niveau edge Cloudflare (caches.default) pour les réponses GET coûteuses
// (pages SEO et sitemaps qui lisent Supabase). Réduit fortement la charge sur la
// base lors des pics de trafic — mitigation directe du scénario PM-04 (panne
// Supabase à Tabaski/Gamou). Le cache respecte le Cache-Control de la réponse.
//
// Usage dans une Function :
//   export async function onRequest(context) {
//     return cachedResponse(context, async () => { ... return new Response(...); });
//   }

export async function cachedResponse(context, producer) {
  const { request } = context;

  // Ne mettre en cache que les GET (les autres méthodes passent directement).
  if (request.method !== 'GET') return producer();

  let cache;
  try { cache = caches.default; } catch { cache = null; }
  // Environnement sans Cache API (tests locaux) → exécuter sans cache.
  if (!cache) return producer();

  // Clé de cache normalisée sur l'URL (ignore les en-têtes/cookies).
  const cacheKey = new Request(new URL(request.url).toString(), { method: 'GET' });

  const hit = await cache.match(cacheKey);
  if (hit) {
    const r = new Response(hit.body, hit);
    r.headers.set('CF-Cache-Status', 'HIT');
    return r;
  }

  const resp = await producer();
  try {
    const cc = resp.headers.get('Cache-Control') || '';
    // On ne cache que les 200 explicitement publics (jamais un 404/redirect).
    if (resp.status === 200 && /public/i.test(cc) && !/no-store/i.test(cc)) {
      if (context.waitUntil) context.waitUntil(cache.put(cacheKey, resp.clone()));
      else await cache.put(cacheKey, resp.clone());
    }
  } catch (_) { /* le cache ne doit jamais casser la réponse */ }
  return resp;
}
