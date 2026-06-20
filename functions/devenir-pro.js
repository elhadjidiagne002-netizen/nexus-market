// functions/devenir-pro.js → /devenir-pro
// Page d'atterrissage SEO de RECRUTEMENT des artisans / ouvriers (NEXUS Pro).
// Indexable (méta + Open Graph + JSON-LD WebPage + FAQPage). CTA → inscription
// pré-remplie en rôle « pro » via ?register=pro (lu par l'app au chargement).
import { cachedResponse } from './_lib/edgecache.js';

function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export async function onRequest(context) {
  return cachedResponse(context, () => handle(context));
}

async function handle({ request, env }) {
  const origin = env.SITE_URL || new URL(request.url).origin;
  const url = `${origin}/devenir-pro`;
  const title = 'Devenir artisan sur NEXUS Pro — trouvez des clients près de chez vous';
  const desc = 'Maçon, plombier, électricien, menuisier, peintre… Inscrivez-vous gratuitement sur NEXUS Pro : '
    + 'apparaissez sur la carte des artisans proches, recevez des demandes par WhatsApp et développez votre activité au Sénégal.';
  const img = `${origin}/og-image.png`;

  const metiers = ['Maçon', 'Plombier', 'Électricien', 'Menuisier', 'Soudeur', 'Peintre', 'Carreleur', 'Froid & Climatisation', 'Plâtrier', 'Jardinier', 'Déménageur', 'Vitrier'];
  const benefits = [
    ['📍', 'Visible près des clients', 'Votre fiche apparaît aux clients qui cherchent votre métier autour de vous.'],
    ['💬', 'Contact WhatsApp direct', 'Les clients vous contactent en un clic, sans intermédiaire.'],
    ['⭐', 'Réputation & avis', 'Cumulez des avis clients qui renforcent votre crédibilité.'],
    ['🆓', '100% gratuit', 'L’inscription et la mise en avant de votre profil sont gratuites.'],
  ];
  const faq = [
    ['Combien coûte l’inscription sur NEXUS Pro ?', 'L’inscription est entièrement gratuite. Vous créez votre compte, indiquez votre métier et votre position, et votre fiche apparaît immédiatement aux clients proches.'],
    ['Comment les clients me contactent-ils ?', 'Les clients qui vous trouvent sur la carte vous contactent directement par WhatsApp ou téléphone, sans commission prélevée par NEXUS.'],
    ['Quels métiers sont concernés ?', 'Tous les métiers du bâtiment et des services à domicile : maçon, plombier, électricien, menuisier, soudeur, peintre, carreleur, climatisation, jardinier, et bien d’autres.'],
  ];

  const graph = JSON.stringify({
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'WebPage', name: title, description: desc, url, inLanguage: 'fr', isPartOf: { '@type': 'WebSite', name: 'NEXUS Market Sénégal', url: origin } },
      { '@type': 'BreadcrumbList', itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Accueil', item: `${origin}/` },
        { '@type': 'ListItem', position: 2, name: 'Devenir artisan', item: url },
      ] },
      { '@type': 'FAQPage', mainEntity: faq.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) },
    ],
  }).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');

  const html = `<!DOCTYPE html><html lang="fr"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} · NEXUS Market</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${esc(url)}">
<meta name="robots" content="index, follow, max-image-preview:large">
<meta property="og:type" content="website">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:image" content="${esc(img)}">
<meta property="og:url" content="${esc(url)}">
<meta property="og:site_name" content="NEXUS Market Sénégal">
<meta property="og:locale" content="fr_SN">
<meta name="twitter:card" content="summary_large_image">
<script type="application/ld+json">${graph}</script>
<style>
:root{--blue:#1d4ed8}
*{box-sizing:border-box}body{font-family:system-ui,-apple-system,'Segoe UI',Roboto,Arial,sans-serif;margin:0;color:#1F2937;line-height:1.6;background:#fff}
.wrap{max-width:820px;margin:0 auto;padding:1.2rem 1rem 3rem}
.crumb{font-size:.8rem;color:#6B7280;margin-bottom:1rem}.crumb a{color:var(--blue);text-decoration:none}
.hero{background:linear-gradient(135deg,#1d4ed8,#3b82f6);color:#fff;border-radius:20px;padding:2.2rem 1.5rem;text-align:center}
.hero h1{font-size:clamp(1.5rem,5vw,2.3rem);margin:0 0 .6rem;font-weight:900}
.hero p{margin:0 auto;max-width:560px;opacity:.95}
.cta{display:inline-block;background:#FDEF42;color:#1a1a1a;padding:14px 32px;border-radius:10px;text-decoration:none;font-weight:800;margin-top:1.3rem;font-size:1.05rem}
.cta.alt{background:transparent;color:#fff;border:2px solid #fff;margin-left:.5rem}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:1rem;margin:2rem 0}
.card{border:1px solid #e5e7eb;border-radius:14px;padding:1.1rem}
.card .e{font-size:1.8rem}.card h3{margin:.5rem 0 .3rem;font-size:1rem}.card p{margin:0;font-size:.9rem;color:#6B7280}
.metiers{display:flex;flex-wrap:wrap;gap:.5rem;margin:1rem 0 2rem}
.metiers span{background:#eef2ff;color:#1e3a8a;border-radius:99px;padding:6px 14px;font-size:.85rem;font-weight:600}
h2{font-size:1.3rem;margin-top:2rem}
.faq{border-top:1px solid #eee;margin-top:1rem}.faq details{border-bottom:1px solid #eee;padding:.8rem 0}.faq summary{font-weight:700;cursor:pointer}
.foot{color:#9CA3AF;font-size:.82rem;margin-top:2.5rem;text-align:center}
.center{text-align:center;margin-top:2rem}
</style>
</head><body><div class="wrap">
<nav class="crumb"><a href="${esc(origin)}/">Accueil</a> › <span>Devenir artisan</span></nav>
<section class="hero">
  <h1>🔧 Développez votre activité avec NEXUS Pro</h1>
  <p>Rejoignez les artisans et ouvriers du Sénégal visibles par des milliers de clients. Gratuit, géolocalisé, sans commission sur vos contacts.</p>
  <a class="cta" href="${esc(origin)}/?register=pro">Créer mon profil pro gratuitement →</a>
</section>

<div class="grid">
  ${benefits.map(([e, t, d]) => `<div class="card"><div class="e">${e}</div><h3>${esc(t)}</h3><p>${esc(d)}</p></div>`).join('')}
</div>

<h2>Tous les métiers sont les bienvenus</h2>
<div class="metiers">${metiers.map(m => `<span>${esc(m)}</span>`).join('')}</div>

<h2>Questions fréquentes</h2>
<div class="faq">
  ${faq.map(([q, a]) => `<details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join('')}
</div>

<div class="center">
  <a class="cta" href="${esc(origin)}/?register=pro" style="background:#1d4ed8;color:#fff">🚀 Je m’inscris comme professionnel</a>
</div>

<p class="foot">NEXUS Market — La marketplace du Sénégal. Artisans, vendeurs, éleveurs et livreurs réunis sur une seule plateforme.</p>
</div></body></html>`;

  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=3600' },
  });
}
