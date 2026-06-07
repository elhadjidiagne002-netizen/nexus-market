// functions/stories.js → /stories
// Page SEO de NEXUS Stories : grille des vidéos produit actives (ItemList +
// Breadcrumb). Capte le trafic « vidéo produit Sénégal », « reels boutique Dakar ».
import { esc, sbGet } from './_lib/seo.js';
import { cachedResponse } from './_lib/edgecache.js';

export async function onRequest(context) {
  return cachedResponse(context, () => handle(context));
}

async function handle({ request, env }) {
  const origin = env.SITE_URL || new URL(request.url).origin;
  const url = `${origin}/stories`;
  const rows = await sbGet(env, `stories?select=id,title,category,city,mux_playback_id&status=eq.active&order=created_at.desc&limit=100`);
  const items = (rows || []).filter(s => s.mux_playback_id);

  const itemList = {
    '@context': 'https://schema.org', '@type': 'ItemList', name: 'NEXUS Stories', numberOfItems: items.length,
    itemListElement: items.slice(0, 100).map((s, i) => ({ '@type': 'ListItem', position: i + 1, url: `${origin}/stories/${encodeURIComponent(s.id)}`, name: s.title || 'Vidéo produit' })),
  };
  const ld = (o) => `<script type="application/ld+json">${JSON.stringify(o).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026')}</script>`;

  const cards = items.map(s => {
    const link = `${origin}/stories/${encodeURIComponent(s.id)}`;
    const poster = `https://image.mux.com/${s.mux_playback_id}/thumbnail.jpg?width=360&fit_mode=preserve`;
    return `<a class="card" href="${esc(link)}"><img src="${esc(poster)}" alt="${esc(s.title || 'Vidéo')}" loading="lazy"><div class="play">▶</div><div class="ct">${esc(s.title || 'Vidéo produit')}</div></a>`;
  }).join('');

  const desc = `Vidéos produit courtes (format Reels) sur NEXUS Stories : ${items.length} vidéos. Les vendeurs filment leurs articles, vous swipez. Plus vivant que les photos — Dakar et tout le Sénégal.`;

  const html = `<!DOCTYPE html><html lang="fr"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>NEXUS Stories — Vidéos produit au Sénégal</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${esc(url)}">
<meta name="robots" content="index, follow, max-image-preview:large">
<meta property="og:type" content="website">
<meta property="og:title" content="NEXUS Stories — Vidéos produit">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${esc(url)}">
<meta property="og:image" content="${origin}/og-image.png">
<meta property="og:site_name" content="NEXUS Market Sénégal">
${ld(itemList)}
<style>body{font-family:Arial,Helvetica,sans-serif;max-width:1100px;margin:0 auto;padding:20px;color:#1F2937}h1{font-size:1.6rem;color:#00853E}a{color:#00853E;text-decoration:none}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:14px}.card{position:relative;display:block;border-radius:12px;overflow:hidden;background:#000}.card img{width:100%;height:260px;object-fit:cover;display:block;opacity:.92}.card .play{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);color:#fff;font-size:34px;text-shadow:0 2px 8px rgba(0,0,0,.6)}.card .ct{position:absolute;bottom:0;left:0;right:0;color:#fff;font-size:.82rem;font-weight:600;padding:10px;background:linear-gradient(transparent,rgba(0,0,0,.75))}.foot{color:#9CA3AF;font-size:.8rem;margin-top:2rem}</style>
</head><body>
<nav style="font-size:.8rem;color:#6B7280;margin-bottom:1rem"><a href="${esc(origin)}/">Accueil</a> › <span>NEXUS Stories</span></nav>
<h1>🎬 NEXUS Stories</h1>
<p style="color:#374151">${esc(desc)}</p>
${items.length ? `<div class="grid">${cards}</div>` : '<p style="color:#6B7280;padding:2rem 0">Aucune vidéo pour le moment. Vendeurs, filmez vos articles !</p>'}
<p style="margin-top:1.6rem"><a href="${esc(origin)}/?stories=1" style="font-weight:700">Ouvrir le mode swipe sur NEXUS →</a></p>
<p class="foot">NEXUS Market — Marketplace sécurisée au Sénégal.</p>
</body></html>`;

  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=600' },
  });
}
