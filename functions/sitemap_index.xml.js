// functions/sitemap_index.xml.js → /sitemap_index.xml
// Index de sitemaps : regroupe le sitemap statique, le sitemap dynamique des fiches,
// et le sitemap des pages catégories/villes. Plus scalable qu'une liste plate.
export async function onRequest({ request, env }) {
  const origin = env.SITE_URL || new URL(request.url).origin;
  const now = new Date().toISOString();
  const maps = [
    `${origin}/sitemap.xml`,
    `${origin}/sitemap-listings.xml`,
    `${origin}/sitemap-categories.xml`,
  ];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${maps.map(m => `  <sitemap>\n    <loc>${m}</loc>\n    <lastmod>${now}</lastmod>\n  </sitemap>`).join('\n')}
</sitemapindex>`;
  return new Response(xml, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=3600' },
  });
}
