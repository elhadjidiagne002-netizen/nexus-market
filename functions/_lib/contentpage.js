// functions/_lib/contentpage.js
// Coque commune des pages de CONTENU éditorial (guides, à propos, contact…).
// But : offrir un contenu original, substantiel et INTERCONNECTÉ, rendu côté
// serveur (crawlable) — réponse au critère Google AdSense « contenu à faible
// valeur informative ». Charte NEXUS (vert/jaune, Inter).
import { esc } from './seo.js';

// Navigation principale (header) — présente sur toutes les pages de contenu.
const NAV = [
  ['/', 'Accueil'],
  ['/guides', 'Guides'],
  ['/faq', 'FAQ'],
  ['/a-propos', 'À propos'],
  ['/contact', 'Contact'],
];

// Maillage interne (footer) — relie toutes les pages de contenu entre elles.
const FOOTER = [
  ['/guide/acheter-en-ligne-au-senegal', 'Acheter en ligne au Sénégal'],
  ['/guide/vendre-sur-nexus-market', 'Vendre sur NEXUS Market'],
  ['/guide/paiement-mobile-money', 'Payer avec Orange Money & Wave'],
  ['/guide/livraison-au-senegal', 'La livraison au Sénégal'],
  ['/devenir-pro', 'Devenir artisan (NEXUS Pro)'],
  ['/devenir-eleveur', 'Devenir éleveur / producteur'],
  ['/guides', 'Tous les guides'],
  ['/faq', 'Questions fréquentes'],
  ['/a-propos', 'À propos de NEXUS'],
  ['/contact', 'Nous contacter'],
  ['/cgu', 'Conditions d’utilisation'],
  ['/confidentialite', 'Politique de confidentialité'],
];

function ld(o) {
  return `<script type="application/ld+json">${JSON.stringify(o)
    .replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026')}</script>`;
}

/**
 * @param {object} o
 *  origin, path, title, description, h1, bodyHtml
 *  crumbName        - libellé du fil d'Ariane (dernier niveau)
 *  isArticle        - true => JSON-LD Article ; sinon WebPage
 *  datePublished    - ISO (articles)
 *  extraGraph       - tableau d'objets JSON-LD additionnels (FAQPage, Organization…)
 */
export function renderContentPage(o) {
  const origin = o.origin;
  const url = origin + o.path;
  const img = `${origin}/og-image.png`;
  const date = o.datePublished || '2026-06-20';

  const main = o.isArticle
    ? { '@type': 'Article', headline: o.title, description: o.description, image: [img],
        datePublished: date, dateModified: date, inLanguage: 'fr',
        author: { '@type': 'Organization', name: 'NEXUS Market' },
        publisher: { '@type': 'Organization', name: 'NEXUS Market',
          logo: { '@type': 'ImageObject', url: `${origin}/icon-512.png` } },
        mainEntityOfPage: url }
    : { '@type': 'WebPage', name: o.title, description: o.description, url, inLanguage: 'fr' };

  const breadcrumb = { '@type': 'BreadcrumbList', itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Accueil', item: `${origin}/` },
    { '@type': 'ListItem', position: 2, name: o.crumbName || o.title, item: url },
  ] };

  const graph = {
    '@context': 'https://schema.org',
    '@graph': [main, breadcrumb, ...(o.extraGraph || [])],
  };

  const navHtml = NAV.map(([h, l]) =>
    `<a href="${esc(origin + h)}">${esc(l)}</a>`).join('');
  const footHtml = FOOTER.map(([h, l]) =>
    `<a href="${esc(origin + h)}">${esc(l)}</a>`).join('');

  return `<!DOCTYPE html><html lang="fr"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(o.title)} · NEXUS Market Sénégal</title>
<meta name="description" content="${esc(o.description)}">
<link rel="canonical" href="${esc(url)}">
<link rel="alternate" hreflang="fr" href="${esc(url)}">
<meta name="robots" content="index, follow, max-image-preview:large">
<meta property="og:type" content="${o.isArticle ? 'article' : 'website'}">
<meta property="og:title" content="${esc(o.title)}">
<meta property="og:description" content="${esc(o.description)}">
<meta property="og:image" content="${esc(img)}">
<meta property="og:url" content="${esc(url)}">
<meta property="og:site_name" content="NEXUS Market Sénégal">
<meta property="og:locale" content="fr_SN">
<meta name="twitter:card" content="summary_large_image">
${ld(graph)}
<style>
:root{--g:#00853E;--gold:#C98A00;--ink:#1F2937;--mut:#6B7280;--bd:#E5E7EB}
*{box-sizing:border-box}body{font-family:Inter,system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;margin:0;color:var(--ink);line-height:1.7;background:#fff}
a{color:var(--g);text-decoration:none}a:hover{text-decoration:underline}
header.nx{background:linear-gradient(135deg,var(--g),#0aa05a);color:#fff;padding:.7rem 1rem}
header.nx .in{max-width:880px;margin:0 auto;display:flex;align-items:center;gap:1rem;flex-wrap:wrap}
header.nx .logo{font-weight:900;font-size:1.15rem;color:#fff;letter-spacing:-.5px}
header.nx nav{display:flex;gap:1rem;flex-wrap:wrap;margin-left:auto}
header.nx nav a{color:#fff;opacity:.95;font-size:.9rem;font-weight:600}
main{max-width:760px;margin:0 auto;padding:1.2rem 1rem 2.5rem}
.crumb{font-size:.8rem;color:var(--mut);margin:.6rem 0 1rem}
h1{font-size:clamp(1.5rem,4.5vw,2.1rem);color:var(--g);margin:.2rem 0 1rem;line-height:1.25}
h2{font-size:1.25rem;margin:1.8rem 0 .6rem}
h3{font-size:1.05rem;margin:1.2rem 0 .4rem}
p,li{font-size:1rem}ul,ol{padding-left:1.3rem}li{margin:.3rem 0}
.lead{font-size:1.1rem;color:#374151}
.box{background:#F0FDF4;border:1px solid #A7F3D0;border-radius:12px;padding:1rem 1.2rem;margin:1.3rem 0}
.cta{display:inline-block;background:var(--g);color:#fff;padding:13px 28px;border-radius:9px;font-weight:800;margin:1.2rem 0}
.cta.gold{background:var(--gold)}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:1rem;margin:1.4rem 0}
.card{border:1px solid var(--bd);border-radius:14px;padding:1.1rem;display:block}
.card h3{margin:.2rem 0 .4rem;color:var(--ink)}.card p{margin:0;color:var(--mut);font-size:.9rem}
footer.nx{border-top:1px solid var(--bd);background:#F9F7F0;margin-top:2rem}
footer.nx .in{max-width:880px;margin:0 auto;padding:1.4rem 1rem 2rem}
footer.nx .links{display:flex;flex-wrap:wrap;gap:.4rem 1.2rem;margin-bottom:1rem}
footer.nx .links a{font-size:.88rem}
footer.nx .cr{color:var(--mut);font-size:.8rem}
</style>
</head><body>
<header class="nx"><div class="in"><a class="logo" href="${esc(origin)}/">🛍️ NEXUS Market</a><nav>${navHtml}</nav></div></header>
<main>
<nav class="crumb"><a href="${esc(origin)}/">Accueil</a> › <span>${esc(o.crumbName || o.title)}</span></nav>
<article>
${o.bodyHtml}
</article>
</main>
<footer class="nx"><div class="in">
<div class="links">${footHtml}</div>
<div class="cr">© ${new Date().getFullYear()} NEXUS Market — Marketplace sécurisée au Sénégal · Orange Money · Wave · Carte bancaire · Livraison partout au Sénégal.</div>
</div></footer>
</body></html>`;
}

export function contentResponse(html) {
  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=3600' },
  });
}
