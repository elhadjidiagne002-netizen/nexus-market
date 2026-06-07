// functions/sitemap-categories.xml.js → /sitemap-categories.xml
// Sitemap des pages d'atterrissage catégories (/categorie/:slug) et villes
// (/ville/:slug). Statique (dérivé des référentiels), cache 24h.
import { CATEGORIES } from './_lib/categories.js';

const VILLE_SLUGS = ['dakar', 'thies', 'saint-louis', 'touba', 'rufisque', 'kaolack', 'mbour', 'ziguinchor', 'diourbel', 'louga', 'tambacounda', 'kolda'];

export async function onRequest({ request, env }) {
  const origin = env.SITE_URL || new URL(request.url).origin;
  const today = new Date().toISOString().slice(0, 10);

  const urls = [];
  for (const c of CATEGORIES) {
    urls.push(`  <url>\n    <loc>${origin}/categorie/${c.slug}</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>daily</changefreq>\n    <priority>0.8</priority>\n  </url>`);
  }
  for (const v of VILLE_SLUGS) {
    urls.push(`  <url>\n    <loc>${origin}/ville/${v}</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>daily</changefreq>\n    <priority>0.7</priority>\n  </url>`);
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join('\n')}
</urlset>`;
  return new Response(xml, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=86400' },
  });
}
