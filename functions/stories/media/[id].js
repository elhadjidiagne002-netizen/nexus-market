// functions/stories/media/[id].js → /stories/media/:id
// [ÉGRESS] Proxy vidéo mis en CACHE côté Cloudflare pour les stories en upload
// direct (bucket Supabase `nexus-stories`). Avant, les pages/og:video/lecteurs
// pointaient sur l'URL Supabase publique brute → chaque vue, crawler (Google,
// WhatsApp/Facebook via og:video) ou partage retéléchargeait le MP4 complet
// depuis l'ÉGRESS SUPABASE. Avec ~89 Mo stockés, l'égress mensuel a atteint 37 Go
// (740 % du quota gratuit). Ici on fetch l'objet UNE fois, on le met en cache edge
// (caches.default + cf.cacheTtl), et on sert tout — y compris les requêtes Range
// (seek vidéo) — depuis Cloudflare. Résultat : quasi zéro égress Supabase récurrent.
//
//   GET|HEAD /stories/media/:id  → le MP4, cache 1 an, Accept-Ranges.
import { sbGetOne } from '../../_lib/seo.js';
import { getMediaObject, objectPathFromPublicUrl } from '../../_lib/r2media.js';

const ONE_YEAR = 60 * 60 * 24 * 365;
const PLAYABLE = new Set(['active', 'closed', 'pending_payment']);

export async function onRequest(context) {
  const { request, env, params } = context;
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response('Method Not Allowed', { status: 405, headers: { Allow: 'GET, HEAD' } });
  }

  // Résoudre l'URL Storage à partir de l'id de story (statuts diffusables seulement).
  const s = await sbGetOne(env, `stories?select=id,video_url,status&id=eq.${encodeURIComponent(params.id)}&limit=1`);
  if (!s || !s.video_url || !PLAYABLE.has(s.status)) {
    return new Response('Not found', { status: 404, headers: { 'Cache-Control': 'public, max-age=60' } });
  }

  // ── Cache edge : on stocke la réponse COMPLÈTE (200) une seule fois, keyée par
  //    l'id (l'URL Supabase peut porter un token ; l'id est stable). Le contenu
  //    d'une story est immuable → cache 1 an « immutable ».
  const origin = new URL(request.url).origin;
  const cacheKey = new Request(`${origin}/stories/media/${encodeURIComponent(s.id)}`, { method: 'GET' });
  let cache = null;
  try { cache = caches.default; } catch { cache = null; }

  let full = cache ? await cache.match(cacheKey) : null;
  if (!full) {
    // [R2] Lecture R2-first + repli Supabase + peuplement R2 (auto-migration).
    // Sans binding MEDIA_BUCKET → 100 % Supabase (comportement inchangé).
    const objectPath = objectPathFromPublicUrl(s.video_url, 'nexus-stories');
    let buf, ct;
    const media = objectPath ? await getMediaObject(context, 'nexus-stories', objectPath) : { error: 'no_path' };
    if (media && media.buf) {
      buf = media.buf; ct = media.contentType || 'video/mp4';
    } else {
      // Repli ultime : fetch direct de l'URL stockée (ex. si elle porte un token).
      const upstream = await fetch(s.video_url, { cf: { cacheEverything: true, cacheTtl: ONE_YEAR } });
      if (!upstream.ok) return new Response('Upstream error', { status: 502 });
      buf = await upstream.arrayBuffer();
      ct = upstream.headers.get('Content-Type') || 'video/mp4';
    }
    full = new Response(buf, {
      status: 200,
      headers: {
        'Content-Type': ct,
        'Content-Length': String(buf.byteLength),
        'Accept-Ranges': 'bytes',
        'Cache-Control': `public, max-age=${ONE_YEAR}, immutable`,
      },
    });
    if (cache) {
      if (context.waitUntil) context.waitUntil(cache.put(cacheKey, full.clone()));
      else await cache.put(cacheKey, full.clone());
    }
  }

  const bodyBuf = await full.clone().arrayBuffer();
  const total = bodyBuf.byteLength;
  const ct = full.headers.get('Content-Type') || 'video/mp4';
  const baseHeaders = {
    'Content-Type': ct,
    'Accept-Ranges': 'bytes',
    'Cache-Control': `public, max-age=${ONE_YEAR}, immutable`,
  };

  // ── Range (seek vidéo) servi depuis le buffer en cache, sans toucher Supabase.
  const range = request.headers.get('Range');
  if (range) {
    const m = /bytes=(\d*)-(\d*)/.exec(range);
    if (m) {
      let start = m[1] === '' ? null : parseInt(m[1], 10);
      let end = m[2] === '' ? null : parseInt(m[2], 10);
      if (start === null) { const n = end || 0; start = Math.max(0, total - n); end = total - 1; }
      else if (end === null || end >= total) { end = total - 1; }
      if (Number.isNaN(start) || start > end || start >= total) {
        return new Response('Range Not Satisfiable', { status: 416, headers: { ...baseHeaders, 'Content-Range': `bytes */${total}` } });
      }
      const slice = bodyBuf.slice(start, end + 1);
      return new Response(request.method === 'HEAD' ? null : slice, {
        status: 206,
        headers: { ...baseHeaders, 'Content-Range': `bytes ${start}-${end}/${total}`, 'Content-Length': String(end - start + 1) },
      });
    }
  }

  return new Response(request.method === 'HEAD' ? null : bodyBuf, {
    status: 200,
    headers: { ...baseHeaders, 'Content-Length': String(total) },
  });
}
