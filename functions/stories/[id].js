// functions/stories/[id].js → /stories/:id
// Page SEO d'une story vidéo (VideoObject JSON-LD + lecteur HLS Mux), indexable.
import { esc, sbGetOne, render404 } from '../_lib/seo.js';
import { cachedResponse } from '../_lib/edgecache.js';

export async function onRequest(context) {
  return cachedResponse(context, () => handle(context));
}

async function handle({ request, env, params }) {
  const origin = env.SITE_URL || new URL(request.url).origin;
  const s = await sbGetOne(env, `stories?select=id,title,description,category,city,mux_playback_id,video_url,duration,vendor_name,created_at,status&id=eq.${encodeURIComponent(params.id)}&limit=1`);
  if (!s || s.status !== 'active' || (!s.mux_playback_id && !s.video_url)) return render404(origin, "Cette vidéo n'est plus disponible.");

  // Deux sources possibles : Mux (HLS adaptatif) ou upload direct (MP4 dans Storage).
  const isMux = !!s.mux_playback_id;
  const url = `${origin}/stories/${encodeURIComponent(s.id)}`;
  const hls = isMux ? `https://stream.mux.com/${s.mux_playback_id}.m3u8` : s.video_url;
  const poster = isMux ? `https://image.mux.com/${s.mux_playback_id}/thumbnail.jpg?width=720&fit_mode=preserve` : '';
  const title = s.title || `Vidéo produit — ${s.category || 'NEXUS'}`;
  const desc = (s.description || `Découvrez ${title} en vidéo sur NEXUS Stories${s.city ? ' à ' + s.city : ''}.`).replace(/\s+/g, ' ').slice(0, 300);
  const durIso = s.duration ? `PT${Math.round(Number(s.duration))}S` : undefined;

  const jsonld = {
    '@context': 'https://schema.org', '@type': 'VideoObject',
    name: title, description: desc,
    uploadDate: s.created_at || new Date().toISOString(),
    contentUrl: hls, embedUrl: url,
  };
  if (poster) jsonld.thumbnailUrl = [poster];
  if (durIso) jsonld.duration = durIso;
  const ld = `<script type="application/ld+json">${JSON.stringify(jsonld).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026')}</script>`;

  const html = `<!DOCTYPE html><html lang="fr"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} · NEXUS Stories</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${esc(url)}">
<meta name="robots" content="index, follow, max-image-preview:large">
<meta property="og:type" content="video.other">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
${poster ? `<meta property="og:image" content="${esc(poster)}">` : ''}
<meta property="og:url" content="${esc(url)}">
<meta property="og:site_name" content="NEXUS Market Sénégal">
<meta property="og:video" content="${esc(hls)}">
<meta name="twitter:card" content="player">
${ld}
<style>body{margin:0;background:#000;color:#fff;font-family:Arial,Helvetica,sans-serif}.wrap{max-width:480px;margin:0 auto;min-height:100vh;display:flex;flex-direction:column}video{width:100%;max-height:80vh;background:#000;object-fit:contain}.meta{padding:14px 16px}.t{font-weight:800;font-size:1.05rem;margin:.2rem 0}.d{color:#bbb;font-size:.9rem}.cta{display:inline-block;margin-top:12px;background:#00853E;color:#fff;padding:11px 22px;border-radius:8px;text-decoration:none;font-weight:700}a.top{color:#3ecf8e;text-decoration:none;font-weight:700;padding:12px 16px;display:inline-block}</style>
</head><body>
<div class="wrap">
<a class="top" href="${esc(origin)}/stories">← NEXUS Stories</a>
<video id="v" controls playsinline autoplay muted${poster ? ` poster="${esc(poster)}"` : ''}></video>
<div class="meta">
<div class="t">${esc(title)}</div>
${s.category ? `<div class="d">${esc(s.category)}${s.city ? ' · ' + esc(s.city) : ''}${s.vendor_name ? ' · ' + esc(s.vendor_name) : ''}</div>` : ''}
<p class="d">${esc(desc)}</p>
<a class="cta" href="${esc(origin)}/?story=${esc(s.id)}">Voir sur NEXUS →</a>
</div>
</div>
${isMux ? '<script src="https://cdn.jsdelivr.net/npm/hls.js@1/dist/hls.min.js"></script>' : ''}
<script>
(function(){var v=document.getElementById('v');var src=${JSON.stringify(hls)};var isMux=${isMux ? 'true' : 'false'};
if(!isMux){v.src=src;return;}
if(v.canPlayType('application/vnd.apple.mpegurl')){v.src=src;}
else if(window.Hls&&window.Hls.isSupported()){var h=new Hls();h.loadSource(src);h.attachMedia(v);}
else{v.src=src;}})();
</script>
</body></html>`;

  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=600' },
  });
}
