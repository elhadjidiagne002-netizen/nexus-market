// functions/sitemap-listings.xml.js → /sitemap-listings.xml
// Sitemap DYNAMIQUE des annonces (annonces_express) + produits actifs, afin que
// les moteurs découvrent chaque fiche. Complète le sitemap statique (accueil/catégories).
// Référencé en plus dans robots.txt. Cache 1h.
import { buildProHubs, proHasSubstance } from './_lib/pro-hubs.js';

function xmlEscape(s) {
  return String(s || '').replace(/[<>&'"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]));
}

// [PAGINATION] Supabase/PostgREST plafonne CHAQUE réponse à 1000 lignes côté
// serveur (db-max-rows), quel que soit le &limit= demandé dans la query string
// — un &limit=5000 ne sert donc à rien au-delà de 1000. Constaté en prod le
// 19/08/2026 : la table `pros` a 2497 lignes actives mais le sitemap n'en
// listait que 1000 (1497 fiches invisibles pour Google, silencieusement,
// sans erreur). sbGetAll pagine via l'en-tête Range par tranches de 1000
// jusqu'à épuisement (page < 1000 lignes) ou jusqu'à maxRows par sécurité.
async function sbGetAll(env, path, maxRows = 20000) {
  const pageSize = 1000;
  const headers = {
    apikey: env.SUPABASE_SERVICE_KEY || env.SUPABASE_ANON_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY || env.SUPABASE_ANON_KEY}`,
  };
  const all = [];
  let offset = 0;
  while (offset < maxRows) {
    try {
      const r = await fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, {
        headers: { ...headers, Range: `${offset}-${offset + pageSize - 1}` },
      });
      if (!r.ok) {
        console.error(`sitemap-listings: requête échouée (${r.status}) sur ${path} (offset ${offset}) — ${await r.text().catch(() => '')}`);
        break;
      }
      const page = await r.json();
      if (!Array.isArray(page) || page.length === 0) break;
      all.push(...page);
      if (page.length < pageSize) break; // dernière page atteinte
      offset += pageSize;
    } catch (e) {
      console.error(`sitemap-listings: exception sur ${path} (offset ${offset}) — ${e?.message || e}`);
      break;
    }
  }
  return all;
}

import { cachedResponse } from './_lib/edgecache.js';

export async function onRequest(context) {
  return cachedResponse(context, () => handle(context));
}

async function handle({ request, env }) {
  const origin = env.SITE_URL || new URL(request.url).origin;
  const nowIso = new Date().toISOString().slice(0, 10);

  // Produits actifs + annonces express + trocs + stories actifs + pros (NEXUS Pro)
  // + vendeurs/boutiques (vitrines /vendeur/:id, JSON-LD Store — étaient absentes
  //   de tout sitemap, donc jamais découvertes par Google).
  const [products, annonces, trocs, stories, pros, vendors, transportLines] = await Promise.all([
    // [ADSENSE/SEO] Les produits de DÉMO (seed UUID a0000001-…) sont filtrés plus bas,
    // côté JS (isDemoId) : products.id est UUID, et l'opérateur PostgREST `like` (texte)
    // appliqué à une colonne uuid renvoie une erreur — la requête entière échouait
    // silencieusement (sbGetAll avalait l'erreur), vidant le sitemap de tous les produits.
    sbGetAll(env, 'products?select=id,name,image_url,updated_at&active=eq.true&order=updated_at.desc'),
    sbGetAll(env, `annonces_express?select=id,category,city,photo_url,created_at&status=eq.active&order=created_at.desc`),
    sbGetAll(env, `troc_listings?select=id,title,photo_url,created_at&status=eq.active&order=created_at.desc`),
    sbGetAll(env, `stories?select=id,mux_playback_id,created_at&status=eq.active&order=created_at.desc`),
    // `city` + les colonnes de substance sont nécessaires au calcul des hubs et
    // au filtrage des fiches indexables (cf. _lib/pro-hubs.js).
    sbGetAll(env, `pros?select=id,profession,city,photo_url,description,experience_years,tarif_text,rating_count,updated_at&status=eq.active&order=updated_at.desc`),
    sbGetAll(env, `profiles?select=id,name,avatar,updated_at&role=eq.vendor&order=updated_at.desc`),
    // Lignes de transport régulières (annuaire public, sql/2026_08_10_transport_lines.sql)
    // → /ligne/:id. Contenu réel/unique par ligne (pas de flag is_vitrine ici).
    sbGetAll(env, `transport_lines?select=id,operator,updated_at,collected_at&active=eq.true&order=operator.asc`),
  ]);

  const urls = [];
  // Images de démo → produit placeholder, exclu de l'index.
  const isPlaceholderImg = (u) => /picsum\.photos|placehold\.co|\/placeholder/i.test(u || '');
  // Produits seed de démo (même convention que functions/produit/[id].js), exclus de l'index.
  const isDemoId = (id) => /^a0000001-/.test(String(id || ''));
  for (const p of (products || [])) {
    if (isDemoId(p.id) || isPlaceholderImg(p.image_url)) continue;
    const loc = `${origin}/produit/${encodeURIComponent(p.id)}`;
    const img = p.image_url ? `\n    <image:image><image:loc>${xmlEscape(p.image_url)}</image:loc><image:title>${xmlEscape(p.name)}</image:title></image:image>` : '';
    urls.push(`  <url>\n    <loc>${xmlEscape(loc)}</loc>\n    <lastmod>${(p.updated_at || '').slice(0, 10) || nowIso}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>0.7</priority>${img}\n  </url>`);
  }
  for (const a of (annonces || [])) {
    const loc = `${origin}/annonce/${encodeURIComponent(a.id)}`;
    const img = a.photo_url ? `\n    <image:image><image:loc>${xmlEscape(a.photo_url)}</image:loc></image:image>` : '';
    urls.push(`  <url>\n    <loc>${xmlEscape(loc)}</loc>\n    <lastmod>${(a.created_at || '').slice(0, 10) || nowIso}</lastmod>\n    <changefreq>daily</changefreq>\n    <priority>0.6</priority>${img}\n  </url>`);
  }
  for (const tr of (trocs || [])) {
    const loc = `${origin}/troc/${encodeURIComponent(tr.id)}`;
    const img = tr.photo_url ? `\n    <image:image><image:loc>${xmlEscape(tr.photo_url)}</image:loc><image:title>${xmlEscape(tr.title)}</image:title></image:image>` : '';
    urls.push(`  <url>\n    <loc>${xmlEscape(loc)}</loc>\n    <lastmod>${(tr.created_at || '').slice(0, 10) || nowIso}</lastmod>\n    <changefreq>daily</changefreq>\n    <priority>0.6</priority>${img}\n  </url>`);
  }
  for (const st of (stories || [])) {
    if (!st.mux_playback_id) continue;
    const loc = `${origin}/stories/${encodeURIComponent(st.id)}`;
    const img = `\n    <image:image><image:loc>https://image.mux.com/${xmlEscape(st.mux_playback_id)}/thumbnail.jpg?width=360</image:loc></image:image>`;
    urls.push(`  <url>\n    <loc>${xmlEscape(loc)}</loc>\n    <lastmod>${(st.created_at || '').slice(0, 10) || nowIso}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>0.6</priority>${img}\n  </url>`);
  }

  /* [SEO 2026-09-05] NEXUS Pro : on ne déclare plus les 2695 fiches une par une.
     Search Console montrait 1352 pages « Détectée, actuellement non indexée »,
     JAMAIS explorées : réclamer l'indexation de milliers de fiches quasi vides
     (0 photo, 0 avis, description moyenne de 5 caractères — mesuré en base) a
     fait couper le budget d'exploration, au détriment des fiches produit, elles
     réellement remplies. On déclare désormais :
       • les hubs métier × ville (contenu agrégé réel, ~107 pages couvrant 90%
         des pros, alignés sur la demande « plombier Dakar ») ;
       • les seules fiches individuelles ayant de la substance.
     Les autres fiches restent en ligne, mais en noindex (cf. functions/pro/[id].js).
     `changefreq` passe à monthly : ces pages ne changent pas chaque semaine —
     l'annoncer était un signal faux de plus. */
  for (const h of buildProHubs(pros).values()) {
    const loc = `${origin}/pro/${h.slug}`;
    urls.push(`  <url>\n    <loc>${xmlEscape(loc)}</loc>\n    <lastmod>${nowIso}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>0.7</priority>\n  </url>`);
  }
  for (const pr of (pros || [])) {
    if (!proHasSubstance(pr)) continue;
    const loc = `${origin}/pro/${encodeURIComponent(pr.id)}`;
    const img = pr.photo_url ? `\n    <image:image><image:loc>${xmlEscape(pr.photo_url)}</image:loc><image:title>${xmlEscape(pr.profession)}</image:title></image:image>` : '';
    urls.push(`  <url>\n    <loc>${xmlEscape(loc)}</loc>\n    <lastmod>${(pr.updated_at || '').slice(0, 10) || nowIso}</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>0.5</priority>${img}\n  </url>`);
  }

  // Boutiques/vendeurs → /vendeur/:id (vitrine SEO Store). Découverte auto des
  // futures boutiques (sitemap dynamique, requêté à chaque crawl, cache 1h).
  for (const vd of (vendors || [])) {
    const loc = `${origin}/vendeur/${encodeURIComponent(vd.id)}`;
    const img = vd.avatar ? `\n    <image:image><image:loc>${xmlEscape(vd.avatar)}</image:loc><image:title>${xmlEscape(vd.name || 'Boutique')}</image:title></image:image>` : '';
    urls.push(`  <url>\n    <loc>${xmlEscape(loc)}</loc>\n    <lastmod>${(vd.updated_at || '').slice(0, 10) || nowIso}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>0.6</priority>${img}\n  </url>`);
  }

  for (const tl of (transportLines || [])) {
    const loc = `${origin}/ligne/${encodeURIComponent(tl.id)}`;
    urls.push(`  <url>\n    <loc>${xmlEscape(loc)}</loc>\n    <lastmod>${(tl.updated_at || tl.collected_at || '').slice(0, 10) || nowIso}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>0.5</priority>\n  </url>`);
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${urls.join('\n')}
</urlset>`;

  return new Response(xml, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=3600' },
  });
}
