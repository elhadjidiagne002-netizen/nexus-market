// functions/sitemap-listings.xml.js → /sitemap-listings.xml
// Sitemap DYNAMIQUE des annonces (annonces_express) + produits actifs, afin que
// les moteurs découvrent chaque fiche. Complète le sitemap statique (accueil/catégories).
// Référencé en plus dans robots.txt. Cache 1h.

function xmlEscape(s) {
  return String(s || '').replace(/[<>&'"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]));
}

async function sbGet(env, path) {
  try {
    const r = await fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, {
      headers: { apikey: env.SUPABASE_SERVICE_KEY || env.SUPABASE_ANON_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY || env.SUPABASE_ANON_KEY}` },
    });
    return r.ok ? await r.json() : [];
  } catch { return []; }
}

import { cachedResponse } from './_lib/edgecache.js';

export async function onRequest(context) {
  return cachedResponse(context, () => handle(context));
}

async function handle({ request, env }) {
  const origin = env.SITE_URL || new URL(request.url).origin;
  const nowIso = new Date().toISOString().slice(0, 10);

  // Produits actifs + annonces express non expirées.
  const [products, annonces] = await Promise.all([
    sbGet(env, 'products?select=id,name,image_url,updated_at&active=eq.true&order=updated_at.desc&limit=5000'),
    sbGet(env, `annonces_express?select=id,category,city,photo_url,created_at&status=eq.active&order=created_at.desc&limit=5000`),
  ]);

  const urls = [];
  for (const p of (products || [])) {
    const loc = `${origin}/produit/${encodeURIComponent(p.id)}`;
    const img = p.image_url ? `\n    <image:image><image:loc>${xmlEscape(p.image_url)}</image:loc><image:title>${xmlEscape(p.name)}</image:title></image:image>` : '';
    urls.push(`  <url>\n    <loc>${xmlEscape(loc)}</loc>\n    <lastmod>${(p.updated_at || '').slice(0, 10) || nowIso}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>0.7</priority>${img}\n  </url>`);
  }
  for (const a of (annonces || [])) {
    const loc = `${origin}/annonce/${encodeURIComponent(a.id)}`;
    const img = a.photo_url ? `\n    <image:image><image:loc>${xmlEscape(a.photo_url)}</image:loc></image:image>` : '';
    urls.push(`  <url>\n    <loc>${xmlEscape(loc)}</loc>\n    <lastmod>${(a.created_at || '').slice(0, 10) || nowIso}</lastmod>\n    <changefreq>daily</changefreq>\n    <priority>0.6</priority>${img}\n  </url>`);
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${urls.join('\n')}
</urlset>`;

  return new Response(xml, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=3600' },
  });
}
