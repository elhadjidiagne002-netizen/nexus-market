// functions/pro/[id].js → /pro/:id
// Page d'atterrissage SEO d'un professionnel NEXUS Pro (ouvrier/artisan).
// Indexable (méta + Open Graph + JSON-LD ProfessionalService + Breadcrumb).
// Le contact est masqué (règle RT-01) → le visiteur passe par l'app pour contacter.
import { esc, redactContact, render404, sbGetOne } from '../_lib/seo.js';
import { cachedResponse } from '../_lib/edgecache.js';

export async function onRequest(context) {
  return cachedResponse(context, () => handle(context));
}

async function handle({ request, env, params }) {
  const origin = env.SITE_URL || new URL(request.url).origin;
  const id = params.id;
  const p = await sbGetOne(
    env,
    `pros?select=id,profession,name,description,city,experience_years,tarif_text,photo_url,rating_avg,rating_count,status&id=eq.${encodeURIComponent(id)}&limit=1`
  );
  if (!p || p.status !== 'active') return render404(origin, "Ce professionnel n'est plus référencé.");

  const url = `${origin}/pro/${encodeURIComponent(p.id)}`;
  const appUrl = `${origin}/?pro=${encodeURIComponent(p.id)}`;
  const name = redactContact(p.name || p.profession || 'Professionnel');
  const title = `${p.profession || 'Professionnel'}${p.city ? ' à ' + p.city : ''} — ${name}`;
  const descParts = [
    p.profession ? `${p.profession}${p.city ? ' à ' + p.city : ' au Sénégal'}.` : '',
    p.experience_years ? `${p.experience_years} ans d'expérience.` : '',
    p.tarif_text ? `Tarif : ${p.tarif_text}.` : '',
    p.description || '',
    'Contactez ce professionnel sur NEXUS Market.',
  ].filter(Boolean);
  const desc = redactContact(descParts.join(' ').replace(/\s+/g, ' ').trim()).slice(0, 300);
  const img = p.photo_url || `${origin}/og-image.png`;
  const rc = Number(p.rating_count) || 0;
  const rv = Number(p.rating_avg) || 0;

  const service = {
    '@type': 'ProfessionalService',
    name: `${name} — ${p.profession || 'Professionnel'}`,
    description: desc,
    image: [img],
    areaServed: p.city || 'Sénégal',
    url,
    address: { '@type': 'PostalAddress', addressLocality: p.city || 'Sénégal', addressCountry: 'SN' },
  };
  if (p.profession) service.knowsAbout = p.profession;
  if (rc > 0 && rv > 0) {
    service.aggregateRating = {
      '@type': 'AggregateRating',
      ratingValue: rv.toFixed(1), reviewCount: rc, bestRating: 5, worstRating: 1,
    };
  }
  const crumbs = [
    { name: 'Accueil', url: `${origin}/` },
    { name: 'NEXUS Pro', url: `${origin}/` },
    { name: title, url },
  ];
  const breadcrumb = {
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name, item: c.url })),
  };
  const graph = JSON.stringify({ '@context': 'https://schema.org', '@graph': [service, breadcrumb] })
    .replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');

  const crumbHtml = crumbs.map((c, i) =>
    i === crumbs.length - 1 ? `<span>${esc(c.name)}</span>` : `<a href="${esc(c.url)}">${esc(c.name)}</a>`
  ).join(' <span class="sep">›</span> ');

  const html = `<!DOCTYPE html><html lang="fr"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} · NEXUS Market Sénégal</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${esc(url)}">
<meta name="robots" content="index, follow, max-image-preview:large">
<meta property="og:type" content="profile">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:image" content="${esc(img)}">
<meta property="og:url" content="${esc(url)}">
<meta property="og:site_name" content="NEXUS Market Sénégal">
<meta property="og:locale" content="fr_SN">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:image" content="${esc(img)}">
<script type="application/ld+json">${graph}</script>
<style>body{font-family:Arial,Helvetica,sans-serif;max-width:760px;margin:0 auto;padding:20px;color:#1F2937;line-height:1.6}img{max-width:100%;height:auto;border-radius:12px}h1{font-size:1.5rem;margin:.4rem 0}.cat{color:#1d4ed8;font-weight:700;font-size:.95rem;margin-bottom:.5rem}.meta{color:#6B7280;font-size:.9rem;margin-bottom:.5rem}.crumb{font-size:.8rem;color:#6B7280;margin-bottom:1rem}.crumb a{color:#1d4ed8;text-decoration:none}.crumb .sep{margin:0 4px}.cta{display:inline-block;background:#1d4ed8;color:#fff;padding:13px 30px;border-radius:8px;text-decoration:none;font-weight:700;margin-top:1.2rem}.rating{color:#F59E0B;font-weight:700}.foot{color:#9CA3AF;font-size:.8rem;margin-top:2.2rem}</style>
</head><body>
<nav class="crumb">${crumbHtml}</nav>
<h1>🔧 ${esc(name)}</h1>
<div class="cat">${esc(p.profession || 'Professionnel')}${p.city ? ' · ' + esc(p.city) : ''}</div>
${(rc > 0 && rv > 0) ? `<div class="rating">★ ${rv.toFixed(1)} <span style="color:#6B7280;font-weight:400">(${rc} avis)</span></div>` : ''}
${p.photo_url ? `<p><img src="${esc(img)}" alt="${esc(name)}" loading="lazy"></p>` : ''}
${p.experience_years || p.tarif_text ? `<div class="meta">${p.experience_years ? esc(p.experience_years) + ' ans d\'expérience' : ''}${(p.experience_years && p.tarif_text) ? ' · ' : ''}${p.tarif_text ? 'Tarif : ' + esc(p.tarif_text) : ''}</div>` : ''}
<p>${esc(desc)}</p>
<a class="cta" href="${esc(appUrl)}">Contacter ce professionnel sur NEXUS Market →</a>
<p class="foot">NEXUS Market — Trouvez un ouvrier ou artisan près de chez vous au Sénégal · Maçon, plombier, électricien, menuisier…</p>
</body></html>`;

  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=600' },
  });
}
