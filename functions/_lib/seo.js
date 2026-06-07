// functions/_lib/seo.js
// Génère des pages d'atterrissage SEO (méta + Open Graph + JSON-LD) côté serveur,
// indexables par Google, avec un lien vers l'app interactive (pas de redirection
// auto → pas de cloaking). Couvre fiches produit/annonce, pages catégorie, vendeur.

import { slugForLabel } from './categories.js';

export function esc(s) {
  return String(s == null ? '' : s).replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
}

// Sérialise un objet JSON-LD en bloc <script> sûr (échappe < > & pour éviter toute
// rupture du contexte HTML / injection).
function jsonLdScript(obj) {
  const json = JSON.stringify(obj).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');
  return `<script type="application/ld+json">${json}</script>`;
}

// Balises hreflang communes (FR par défaut, Wolof/EN via ?lang=, x-default).
function hreflangTags(url) {
  const sep = url.includes('?') ? '&' : '?';
  return [
    `<link rel="alternate" hreflang="fr" href="${esc(url)}">`,
    `<link rel="alternate" hreflang="wo" href="${esc(url + sep + 'lang=wo')}">`,
    `<link rel="alternate" hreflang="en" href="${esc(url + sep + 'lang=en')}">`,
    `<link rel="alternate" hreflang="x-default" href="${esc(url)}">`,
  ].join('\n');
}

/**
 * Page fiche produit / annonce.
 * @param {object} o { origin, kind:'produit'|'annonce', id, title, description,
 *   image, priceFcfa, category, city, rating, reviewsCount, inStock,
 *   vendorName, vendorId, priceValidUntil, brand }
 */
export function renderListingPage(o) {
  const kind = o.kind === 'annonce' ? 'annonce' : 'produit';
  const url = `${o.origin}/${kind}/${encodeURIComponent(o.id)}`;
  const appUrl = `${o.origin}/?product=${encodeURIComponent(o.id)}`;
  const title = o.title || 'Annonce NEXUS Market';
  const priceTxt = o.priceFcfa ? `${Number(o.priceFcfa).toLocaleString('fr-FR')} FCFA` : '';
  const desc = String(o.description || `${title} — ${o.category || ''} ${o.city || ''} sur NEXUS Market Sénégal.`)
    .replace(/\s+/g, ' ').trim().slice(0, 300);
  const img = o.image || `${o.origin}/og-image.png`;

  // ── Product ────────────────────────────────────────────────
  const product = {
    '@type': 'Product', name: title, image: [img], description: desc,
  };
  if (o.category) product.category = o.category;
  if (o.brand) product.brand = { '@type': 'Brand', name: o.brand };
  if (o.priceFcfa) {
    const offer = {
      '@type': 'Offer', price: Number(o.priceFcfa), priceCurrency: 'XOF',
      availability: o.inStock === false ? 'https://schema.org/OutOfStock' : 'https://schema.org/InStock',
      itemCondition: 'https://schema.org/NewCondition', url,
      seller: { '@type': 'Organization', name: o.vendorName || 'NEXUS Market Sénégal' },
    };
    if (o.priceValidUntil) offer.priceValidUntil = o.priceValidUntil;
    product.offers = offer;
  }
  // AggregateRating uniquement si avis réels (Google pénalise les notes fictives/vides).
  const rc = Number(o.reviewsCount) || 0;
  const rv = Number(o.rating) || 0;
  if (rc > 0 && rv > 0) {
    product.aggregateRating = {
      '@type': 'AggregateRating',
      ratingValue: rv.toFixed(1), reviewCount: rc, bestRating: 5, worstRating: 1,
    };
  }

  // ── BreadcrumbList ─────────────────────────────────────────
  const crumbs = [{ name: 'Accueil', url: `${o.origin}/` }];
  if (o.category) crumbs.push({ name: o.category, url: `${o.origin}/categorie/${slugForLabel(o.category)}` });
  crumbs.push({ name: title, url });
  const breadcrumb = {
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name, item: c.url })),
  };

  const graph = jsonLdScript({ '@context': 'https://schema.org', '@graph': [product, breadcrumb] });

  const crumbHtml = crumbs.map((c, i) =>
    i === crumbs.length - 1 ? `<span>${esc(c.name)}</span>` : `<a href="${esc(c.url)}">${esc(c.name)}</a>`
  ).join(' <span class="sep">›</span> ');

  return `<!DOCTYPE html><html lang="fr"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}${priceTxt ? ' — ' + priceTxt : ''} · NEXUS Market Sénégal</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${esc(url)}">
${hreflangTags(url)}
<meta name="robots" content="index, follow, max-image-preview:large">
<meta property="og:type" content="product">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:image" content="${esc(img)}">
<meta property="og:url" content="${esc(url)}">
<meta property="og:site_name" content="NEXUS Market Sénégal">
<meta property="og:locale" content="fr_SN">
${o.priceFcfa ? `<meta property="product:price:amount" content="${Number(o.priceFcfa)}"><meta property="product:price:currency" content="XOF">` : ''}
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:image" content="${esc(img)}">
${graph}
<style>body{font-family:Arial,Helvetica,sans-serif;max-width:760px;margin:0 auto;padding:20px;color:#1F2937;line-height:1.6}img{max-width:100%;height:auto;border-radius:12px}h1{font-size:1.5rem;margin:.4rem 0}.price{color:#00853E;font-size:1.7rem;font-weight:800;margin:.6rem 0}.cat{color:#6B7280;font-size:.85rem;margin-bottom:.5rem}.crumb{font-size:.8rem;color:#6B7280;margin-bottom:1rem}.crumb a{color:#00853E;text-decoration:none}.crumb .sep{margin:0 4px}.cta{display:inline-block;background:#00853E;color:#fff;padding:13px 30px;border-radius:8px;text-decoration:none;font-weight:700;margin-top:1.2rem}.top{color:#00853E;text-decoration:none;font-weight:700}.rating{color:#F59E0B;font-weight:700}.foot{color:#9CA3AF;font-size:.8rem;margin-top:2.2rem}</style>
</head><body>
<nav class="crumb">${crumbHtml}</nav>
<h1>${esc(title)}</h1>
${o.category ? `<div class="cat">${esc(o.category)}${o.city ? ' · ' + esc(o.city) : ''}</div>` : ''}
${(rc > 0 && rv > 0) ? `<div class="rating">★ ${rv.toFixed(1)} <span style="color:#6B7280;font-weight:400">(${rc} avis)</span></div>` : ''}
${o.image ? `<p><img src="${esc(img)}" alt="${esc(title)}" loading="lazy"></p>` : ''}
${priceTxt ? `<div class="price">${esc(priceTxt)}</div>` : ''}
<p>${esc(desc)}</p>
<a class="cta" href="${esc(appUrl)}">Voir ${kind === 'annonce' ? "l'annonce" : 'le produit'} sur NEXUS Market →</a>
<p class="foot">NEXUS Market — Marketplace sécurisée au Sénégal · Orange Money · Wave · Livraison partout.</p>
</body></html>`;
}

/**
 * Page liste (catégorie, vendeur, ville) : titre + intro + grille d'items +
 * JSON-LD ItemList + BreadcrumbList. `items` = [{ id, kind, title, image, priceFcfa }].
 */
export function renderListPage(o) {
  const url = o.url;
  const items = Array.isArray(o.items) ? o.items : [];
  const desc = String(o.description || '').replace(/\s+/g, ' ').trim().slice(0, 300);
  const img = o.image || `${o.origin}/og-image.png`;

  const itemList = {
    '@type': 'ItemList', name: o.title, numberOfItems: items.length,
    itemListElement: items.slice(0, 100).map((it, i) => ({
      '@type': 'ListItem', position: i + 1,
      url: `${o.origin}/${it.kind === 'annonce' ? 'annonce' : 'produit'}/${encodeURIComponent(it.id)}`,
      name: it.title,
    })),
  };
  const crumbs = (o.breadcrumb && o.breadcrumb.length) ? o.breadcrumb : [{ name: 'Accueil', url: `${o.origin}/` }, { name: o.title, url }];
  const breadcrumb = {
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name, item: c.url })),
  };
  const extra = o.jsonldExtra ? [o.jsonldExtra] : [];
  const graph = jsonLdScript({ '@context': 'https://schema.org', '@graph': [itemList, breadcrumb, ...extra] });

  const crumbHtml = crumbs.map((c, i) =>
    i === crumbs.length - 1 ? `<span>${esc(c.name)}</span>` : `<a href="${esc(c.url)}">${esc(c.name)}</a>`
  ).join(' <span class="sep">›</span> ');

  const cards = items.map(it => {
    const link = `${o.origin}/${it.kind === 'annonce' ? 'annonce' : 'produit'}/${encodeURIComponent(it.id)}`;
    const priceTxt = it.priceFcfa ? `${Number(it.priceFcfa).toLocaleString('fr-FR')} FCFA` : '';
    return `<a class="card" href="${esc(link)}">${it.image ? `<img src="${esc(it.image)}" alt="${esc(it.title)}" loading="lazy">` : '<div class="ph"></div>'}<div class="ci"><div class="ct">${esc(it.title)}</div>${priceTxt ? `<div class="cp">${esc(priceTxt)}</div>` : ''}</div></a>`;
  }).join('');

  return `<!DOCTYPE html><html lang="fr"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(o.title)} · NEXUS Market Sénégal</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${esc(url)}">
${hreflangTags(url)}
<meta name="robots" content="index, follow, max-image-preview:large">
<meta property="og:type" content="website">
<meta property="og:title" content="${esc(o.title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:image" content="${esc(img)}">
<meta property="og:url" content="${esc(url)}">
<meta property="og:site_name" content="NEXUS Market Sénégal">
<meta property="og:locale" content="fr_SN">
<meta name="twitter:card" content="summary_large_image">
${graph}
<style>body{font-family:Arial,Helvetica,sans-serif;max-width:1100px;margin:0 auto;padding:20px;color:#1F2937;line-height:1.6}h1{font-size:1.6rem;margin:.4rem 0}.crumb{font-size:.8rem;color:#6B7280;margin-bottom:1rem}.crumb a{color:#00853E;text-decoration:none}.crumb .sep{margin:0 4px}.intro{color:#374151;margin-bottom:1.4rem}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:16px}.card{display:block;border:1px solid #E5E7EB;border-radius:12px;overflow:hidden;text-decoration:none;color:inherit;background:#fff}.card img,.card .ph{width:100%;height:160px;object-fit:cover;background:#F3F4F6;display:block}.ci{padding:10px}.ct{font-size:.9rem;font-weight:600;line-height:1.3;max-height:2.6em;overflow:hidden}.cp{color:#00853E;font-weight:800;margin-top:6px}.top{color:#00853E;text-decoration:none;font-weight:700}.empty{color:#6B7280;padding:2rem 0}.foot{color:#9CA3AF;font-size:.8rem;margin-top:2.4rem}</style>
</head><body>
<nav class="crumb">${crumbHtml}</nav>
<h1>${esc(o.title)}</h1>
${desc ? `<p class="intro">${esc(desc)}</p>` : ''}
${items.length ? `<div class="grid">${cards}</div>` : '<p class="empty">Aucune annonce pour le moment. Revenez bientôt !</p>'}
<p style="margin-top:1.6rem"><a class="top" href="${esc(o.origin)}/">← Explorer toute la marketplace NEXUS</a></p>
<p class="foot">NEXUS Market — Marketplace sécurisée au Sénégal · Orange Money · Wave · Livraison partout.</p>
</body></html>`;
}

// Page 404 SEO-friendly (noindex) : utilisée quand une fiche n'existe plus.
export function render404(origin, message) {
  return new Response(`<!DOCTYPE html><html lang="fr"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Introuvable · NEXUS Market</title>
<meta name="robots" content="noindex, follow">
<style>body{font-family:Arial,sans-serif;max-width:560px;margin:60px auto;padding:20px;text-align:center;color:#1F2937}a{color:#00853E;font-weight:700;text-decoration:none}</style>
</head><body>
<h1>Introuvable</h1>
<p>${esc(message || "Cette page n'existe plus ou a été retirée.")}</p>
<p><a href="${esc(origin)}/">← Retour à NEXUS Market</a></p>
</body></html>`, {
    status: 404,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=300' },
  });
}

// ── Helpers Supabase REST ──────────────────────────────────────
function sbHeaders(env) {
  const key = env.SUPABASE_SERVICE_KEY || env.SUPABASE_ANON_KEY;
  return { apikey: key, Authorization: `Bearer ${key}` };
}

export async function sbGetOne(env, path) {
  try {
    const r = await fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, { headers: sbHeaders(env) });
    if (!r.ok) return null;
    const rows = await r.json();
    return Array.isArray(rows) && rows[0] ? rows[0] : null;
  } catch { return null; }
}

export async function sbGet(env, path) {
  try {
    const r = await fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, { headers: sbHeaders(env) });
    return r.ok ? await r.json() : [];
  } catch { return []; }
}
