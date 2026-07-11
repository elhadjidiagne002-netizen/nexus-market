// functions/img/[[path]].js → /img/<chemin-objet-nexus-images>
// [ÉGRESS + OPTIMISATION] Proxy image mis en CACHE côté Cloudflare pour le bucket
// Supabase `nexus-images`. Même problème que les vidéos de stories : les images
// servies via l'URL supabase.co publique brute contournent Cloudflare → égress
// Supabase à chaque affichage de carte/fiche/accueil. Ici on sert TOUTES les
// images du bucket via nexusmarket.sn, mises en cache edge (1 an), donc l'égress
// récurrent sort de Supabase (Cloudflare = gratuit).
//
// [IMAGOR — optionnel] Si `IMAGOR_BASE_URL` est configuré (serveur Imagor
// self-hosted, cf. github.com/cshum/imagor, Docker-ready), le proxy route l'image
// via Imagor pour conversion WebP/AVIF + redimensionnement à la volée :
//     /img/<path>?w=800&h=0&fmt=webp&q=80
// Sans Imagor configuré : on sert l'original tel quel (juste mis en cache) —
// dégradation gracieuse identique au double-fournisseur WhatsApp (Green API/WAHA).
//   Variables : IMAGOR_BASE_URL (sans slash final), IMAGOR_SECRET (signature
//   thumbor HMAC-SHA1 ; si absent → mode `unsafe`, Imagor doit tourner en IMAGOR_UNSAFE=1).
//
//   GET|HEAD /img/:path  → image, cache 1 an immutable.

const ONE_YEAR = 60 * 60 * 24 * 365;

// base64url d'un ArrayBuffer/Uint8Array.
function b64url(buf) {
  const bytes = buf instanceof ArrayBuffer ? new Uint8Array(buf) : buf;
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// Signature thumbor/imagor : base64url(HMAC-SHA1(secret, cheminAprèsSignature)).
async function imagorSign(secret, pathToSign) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(pathToSign));
  return b64url(sig);
}

// Construit l'URL Imagor pour une image source + options de transformation.
async function buildImagorUrl(env, sourceUrl, { w, h, fmt, q }) {
  const segs = [];
  if (w || h) segs.push('fit-in', `${w || 0}x${h || 0}`);
  const filters = [`format(${fmt})`, `quality(${q})`];
  segs.push(`filters:${filters.join(':')}`);
  // Le chemin signé = <params>/<source>. Imagor (loader HTTP) prend l'URL source
  // en dernier segment. On n'accepte QUE nos propres URLs Storage (pas d'open proxy).
  const pathToSign = `${segs.join('/')}/${sourceUrl}`;
  const sig = env.IMAGOR_SECRET ? await imagorSign(env.IMAGOR_SECRET, pathToSign) : 'unsafe';
  const base = env.IMAGOR_BASE_URL.replace(/\/+$/, '');
  return `${base}/${sig}/${pathToSign}`;
}

export async function onRequest(context) {
  const { request, env, params } = context;
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response('Method Not Allowed', { status: 405, headers: { Allow: 'GET, HEAD' } });
  }

  // params.path = segments après /img/ (tableau pour la route catch-all [[path]]).
  const objectPath = Array.isArray(params.path) ? params.path.join('/') : String(params.path || '');
  if (!objectPath) return new Response('Not found', { status: 404 });

  // [DEBUG TEMPORAIRE] Diagnostic booléen (jamais la valeur) pour vérifier que
  // les variables Imagor sont bien vues par le runtime — à retirer une fois le
  // branchement confirmé. Activé uniquement via en-tête explicite.
  if (request.headers.get('X-Imagor-Debug') === '1') {
    return new Response(JSON.stringify({
      imagor_base_url_set: !!env.IMAGOR_BASE_URL,
      imagor_secret_set: !!env.IMAGOR_SECRET,
      imagor_base_url_value_length: (env.IMAGOR_BASE_URL || '').length,
    }), { headers: { 'Content-Type': 'application/json' } });
  }

  const url = new URL(request.url);
  const qp = url.searchParams;
  const w = Math.max(0, parseInt(qp.get('w') || '0', 10) || 0);
  const h = Math.max(0, parseInt(qp.get('h') || '0', 10) || 0);
  let fmt = (qp.get('fmt') || '').toLowerCase();
  if (!['webp', 'avif', 'jpeg', 'jpg', 'png'].includes(fmt)) {
    // Négociation simple via Accept (AVIF > WebP), sinon WebP par défaut.
    const accept = request.headers.get('Accept') || '';
    fmt = /image\/avif/.test(accept) ? 'avif' : 'webp';
  }
  const q = Math.min(100, Math.max(1, parseInt(qp.get('q') || '80', 10) || 80));

  // URL source = objet public du bucket nexus-images de NOTRE projet (jamais une
  // URL arbitraire fournie par l'appelant → pas d'open proxy / SSRF).
  const base = (env.SUPABASE_URL || '').replace(/\/+$/, '');
  const sourceUrl = `${base}/storage/v1/object/public/nexus-images/${objectPath}`;

  // Clé de cache : chemin + variantes de transfo (w/h/fmt/q) → chaque variante cachée.
  const cacheKeyUrl = `${url.origin}/img/${objectPath}?w=${w}&h=${h}&fmt=${fmt}&q=${q}`;
  const cacheKey = new Request(cacheKeyUrl, { method: 'GET' });
  let cache = null;
  try { cache = caches.default; } catch { cache = null; }

  let hit = cache ? await cache.match(cacheKey) : null;
  if (hit) {
    const r = new Response(request.method === 'HEAD' ? null : hit.body, hit);
    r.headers.set('CF-Cache-Status', 'HIT');
    return r;
  }

  // Fetch : via Imagor si configuré (WebP/AVIF + resize), sinon original Supabase.
  const imagorReady = !!env.IMAGOR_BASE_URL;
  let upstream = null;
  if (imagorReady) {
    try {
      const imagorUrl = await buildImagorUrl(env, sourceUrl, { w, h, fmt, q });
      upstream = await fetch(imagorUrl, { cf: { cacheEverything: true, cacheTtl: ONE_YEAR } });
      if (!upstream.ok) upstream = null; // repli sur l'original ci-dessous
    } catch (_) { upstream = null; }
  }
  if (!upstream) {
    upstream = await fetch(sourceUrl, { cf: { cacheEverything: true, cacheTtl: ONE_YEAR } });
    if (!upstream.ok) return new Response('Not found', { status: upstream.status === 404 ? 404 : 502, headers: { 'Cache-Control': 'public, max-age=60' } });
  }

  const buf = await upstream.arrayBuffer();
  const ct = upstream.headers.get('Content-Type') || 'image/jpeg';
  const resp = new Response(request.method === 'HEAD' ? null : buf, {
    status: 200,
    headers: {
      'Content-Type': ct,
      'Content-Length': String(buf.byteLength),
      'Cache-Control': `public, max-age=${ONE_YEAR}, immutable`,
      'CF-Cache-Status': 'MISS',
    },
  });
  if (cache) {
    const toCache = new Response(buf, { status: 200, headers: { 'Content-Type': ct, 'Cache-Control': `public, max-age=${ONE_YEAR}, immutable` } });
    if (context.waitUntil) context.waitUntil(cache.put(cacheKey, toCache));
    else await cache.put(cacheKey, toCache);
  }
  return resp;
}
