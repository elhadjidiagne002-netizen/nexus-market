// functions/pro/[id].js → /pro/:id
// Page d'atterrissage SEO d'un professionnel NEXUS Pro (ouvrier/artisan).
// Indexable (méta + Open Graph + JSON-LD ProfessionalService + Breadcrumb).
// Le contact est masqué (règle RT-01) → le visiteur passe par l'app pour contacter.
import { esc, redactContact, render404, sbGet, sbGetAll, sbGetOne } from '../_lib/seo.js';
import { cachedResponse } from '../_lib/edgecache.js';
import { buildProHubs, pgIn, PRO_MIN_PER_HUB, proHasSubstance, proHubSlug } from '../_lib/pro-hubs.js';

export async function onRequest(context) {
  return cachedResponse(context, () => handle(context));
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function handle(context) {
  const { request, env, params } = context;
  const origin = env.SITE_URL || new URL(request.url).origin;
  const id = params.id;
  // /pro/<uuid> = fiche d'un pro ; /pro/<metier>-<ville> = page d'annuaire.
  // Même route, aucun conflit possible : un slug n'est jamais un UUID.
  if (!UUID_RE.test(id)) return handleHub(origin, env, id);
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
  /* [SEO 2026-09-05] Une fiche sans contenu propre (ni description réelle, ni
     photo, ni avis, ni expérience+tarif) est mise en noindex : elle n'apporte
     rien de plus que le hub métier × ville, et en réclamer l'indexation par
     milliers a fait couper le budget d'exploration de tout le site (cf.
     _lib/pro-hubs.js). Elle reste accessible — `follow` garde le maillage. */
  const indexable = proHasSubstance(p);
  const hubSlug = proHubSlug(p.profession, p.city);
  const hubLabel = `${p.profession || 'Professionnels'}${p.city ? ' à ' + p.city : ''}`;
  // Ne lier vers le hub QUE s'il existe réellement (seuil PRO_MIN_PER_HUB),
  // sinon la fiche pointerait vers un 404. Sonde volontairement bornée à
  // PRO_MIN_PER_HUB lignes. Test sur la seule orthographe de CETTE fiche : le
  // hub fusionne les variantes, donc son total est ≥ à ce compte — jamais
  // l'inverse, on ne peut donc pas conclure à tort qu'il existe.
  let hubUrl = '';
  if (hubSlug && p.profession && p.city) {
    const peers = await sbGet(
      env,
      `pros?select=id&status=eq.active&profession=eq.${encodeURIComponent(p.profession)}`
      + `&city=eq.${encodeURIComponent(p.city)}&limit=${PRO_MIN_PER_HUB}`
    );
    if ((peers || []).length >= PRO_MIN_PER_HUB) hubUrl = `${origin}/pro/${hubSlug}`;
  }

  const crumbs = [
    { name: 'Accueil', url: `${origin}/` },
    { name: 'NEXUS Pro', url: `${origin}/` },
  ].concat(hubUrl ? [{ name: hubLabel, url: hubUrl }] : []).concat([{ name: title, url }]);
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
<meta name="robots" content="${indexable ? 'index, follow, max-image-preview:large' : 'noindex, follow'}">
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
${hubUrl ? `<p style="margin-top:1.4rem"><a href="${esc(hubUrl)}" style="color:#1d4ed8;font-weight:700;text-decoration:none">← Voir tous les ${esc(hubLabel.toLowerCase())}</a></p>` : ''}
<p class="foot">NEXUS Market — Trouvez un ouvrier ou artisan près de chez vous au Sénégal · Maçon, plombier, électricien, menuisier…</p>
</body></html>`;

  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=600' },
  });
}

// ── Page d'annuaire /pro/<metier>-<ville> ────────────────────────────────────
async function handleHub(origin, env, slug) {
  // Résolution du slug : on ne peut pas le « dé-slugifier » (« Froid &
  // Climatisation » → « froid-climatisation » : la coupure métier/ville est
  // ambiguë). On reconstruit donc la table des combos et on compare les slugs.
  // sbGetAll (et non sbGet) : 2695 pros actifs > le plafond de 1000 lignes de
  // PostgREST, qui tronquerait en silence et ferait disparaître des hubs.
  const all = await sbGetAll(env, 'pros?select=profession,city&status=eq.active');
  const hubs = buildProHubs(all);
  const hub = hubs.get(String(slug).toLowerCase());
  if (!hub) return render404(origin, "Cette page d'annuaire n'existe pas.");

  // `in.(…)` sur TOUTES les variantes d'orthographe du slug (cf. buildProHubs) :
  // avec un `eq.` sur une seule variante, la page annoncerait 8 artisans et n'en
  // afficherait que 6.
  const rows = await sbGet(
    env,
    `pros?select=id,name,profession,city,description,experience_years,tarif_text,rating_avg,rating_count`
    + `&status=eq.active&profession=in.${encodeURIComponent(pgIn(hub.professions))}`
    + `&city=in.${encodeURIComponent(pgIn(hub.cities))}&order=updated_at.desc&limit=60`
  ) || [];

  const url = `${origin}/pro/${hub.slug}`;
  const title = `${hub.profession} à ${hub.city}`;
  const n = rows.length;
  // Description factuelle : uniquement des chiffres réellement en base — on
  // n'invente ni délai, ni tarif, ni promesse de service.
  const desc = `${n} ${hub.profession.toLowerCase()}${n > 1 ? 's' : ''} référencé${n > 1 ? 's' : ''} à ${hub.city} sur NEXUS Market. `
    + `Consultez les profils et contactez directement le professionnel de votre choix.`;

  // Autres villes pour ce métier + autres métiers dans cette ville : maillage
  // interne réel entre les hubs (ce qui manquait totalement aux fiches isolées).
  const sameJob = [], sameCity = [];
  for (const h of hubs.values()) {
    if (h.slug === hub.slug) continue;
    if (h.profession === hub.profession) sameJob.push(h);
    else if (h.city === hub.city) sameCity.push(h);
  }
  const linkList = (arr, label) => arr.length
    ? `<h2>${esc(label)}</h2><ul>${arr.slice(0, 12).map(h =>
        `<li><a href="${esc(origin)}/pro/${esc(h.slug)}">${esc(h.profession)} à ${esc(h.city)}</a> (${h.count})</li>`
      ).join('')}</ul>`
    : '';

  const cards = rows.map(r => {
    const nm = esc(redactContact(r.name || r.profession || 'Professionnel'));
    const bits = [
      r.experience_years ? `${esc(r.experience_years)} ans d'expérience` : '',
      r.tarif_text ? `Tarif : ${esc(redactContact(r.tarif_text))}` : '',
      (Number(r.rating_count) > 0 && Number(r.rating_avg) > 0)
        ? `★ ${Number(r.rating_avg).toFixed(1)} (${r.rating_count} avis)` : '',
    ].filter(Boolean).join(' · ');
    const d = String(r.description || '').trim();
    return `<li class="p"><a href="${esc(origin)}/pro/${esc(r.id)}">${nm}</a>`
      + (bits ? `<div class="m">${bits}</div>` : '')
      + (d.length >= 20 ? `<div class="d">${esc(redactContact(d).slice(0, 180))}</div>` : '')
      + `</li>`;
  }).join('');

  const itemList = {
    '@type': 'ItemList', name: title, numberOfItems: n,
    itemListElement: rows.slice(0, 60).map((r, i) => ({
      '@type': 'ListItem', position: i + 1,
      url: `${origin}/pro/${encodeURIComponent(r.id)}`,
      name: redactContact(r.name || hub.profession),
    })),
  };
  const crumbs = [
    { name: 'Accueil', url: `${origin}/` },
    { name: 'NEXUS Pro', url: `${origin}/` },
    { name: title, url },
  ];
  const breadcrumb = {
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name, item: c.url })),
  };
  const graph = JSON.stringify({ '@context': 'https://schema.org', '@graph': [itemList, breadcrumb] })
    .replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');
  const crumbHtml = crumbs.map((c, i) =>
    i === crumbs.length - 1 ? `<span>${esc(c.name)}</span>` : `<a href="${esc(c.url)}">${esc(c.name)}</a>`
  ).join(' <span class="sep">›</span> ');

  const html = `<!DOCTYPE html><html lang="fr"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} — ${n} professionnel${n > 1 ? 's' : ''} · NEXUS Market Sénégal</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${esc(url)}">
<meta name="robots" content="index, follow, max-image-preview:large">
<meta property="og:type" content="website">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:image" content="${esc(origin)}/og-image.png">
<meta property="og:url" content="${esc(url)}">
<meta property="og:site_name" content="NEXUS Market Sénégal">
<meta property="og:locale" content="fr_SN">
<script type="application/ld+json">${graph}</script>
<style>body{font-family:Arial,Helvetica,sans-serif;max-width:860px;margin:0 auto;padding:20px;color:#1F2937;line-height:1.6}h1{font-size:1.55rem;margin:.4rem 0}h2{font-size:1.05rem;color:#1d4ed8;margin:1.6rem 0 .4rem}.crumb{font-size:.8rem;color:#6B7280;margin-bottom:1rem}.crumb a{color:#1d4ed8;text-decoration:none}.crumb .sep{margin:0 4px}.intro{color:#374151;margin-bottom:1.2rem}ul{list-style:none;padding:0}ul ul,.links ul{list-style:disc;padding-left:1.2rem}.p{border:1px solid #E5E7EB;border-radius:10px;padding:12px 14px;margin-bottom:10px}.p a{color:#1d4ed8;font-weight:700;text-decoration:none;font-size:1rem}.m{color:#6B7280;font-size:.85rem;margin-top:2px}.d{color:#374151;font-size:.9rem;margin-top:4px}.links a{color:#1d4ed8}.cta{display:inline-block;background:#1d4ed8;color:#fff;padding:13px 30px;border-radius:8px;text-decoration:none;font-weight:700;margin-top:1.2rem}.foot{color:#9CA3AF;font-size:.8rem;margin-top:2.4rem}</style>
</head><body>
<nav class="crumb">${crumbHtml}</nav>
<h1>${esc(title)}</h1>
<p class="intro">${esc(desc)}</p>
<ul>${cards}</ul>
<a class="cta" href="${esc(origin)}/?pro=1">Trouver un artisan près de chez moi →</a>
<div class="links">${linkList(sameJob, `${hub.profession} dans d'autres villes`)}${linkList(sameCity, `Autres métiers à ${hub.city}`)}</div>
<p class="foot">NEXUS Market — Trouvez un ouvrier ou artisan près de chez vous au Sénégal.</p>
</body></html>`;

  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=1800' },
  });
}
