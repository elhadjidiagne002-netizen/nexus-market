// functions/devenir-eleveur.js → /devenir-eleveur
// Page d'atterrissage SEO de RECRUTEMENT des éleveurs / producteurs locaux.
// CTA → inscription pré-remplie en rôle « breeder » via ?register=breeder.
import { cachedResponse } from './_lib/edgecache.js';

function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export async function onRequest(context) {
  return cachedResponse(context, () => handle(context));
}

async function handle({ request, env }) {
  const origin = env.SITE_URL || new URL(request.url).origin;
  const url = `${origin}/devenir-eleveur`;
  const title = 'Devenir éleveur / producteur local sur NEXUS — vendez près de chez vous';
  const desc = 'Éleveurs (moutons Tabaski, volaille, bétail) et producteurs du terroir : inscrivez-vous gratuitement sur NEXUS, '
    + 'apparaissez sur la carte des éleveurs proches et vendez en direct aux acheteurs du Sénégal.';
  const img = `${origin}/og-image.png`;

  const benefits = [
    ['📍', 'Sur la carte des éleveurs', 'Les acheteurs proches vous trouvent par géolocalisation.'],
    ['🐏', 'Spécial Tabaski', 'Mettez en avant vos moutons et bétail à l’approche de l’Aïd.'],
    ['💬', 'Vente en direct', 'Les acheteurs vous contactent directement, sans intermédiaire.'],
    ['🆓', '100% gratuit', 'Activez votre profil éleveur gratuitement en quelques secondes.'],
  ];
  const faq = [
    ['Qui peut s’inscrire comme éleveur ?', 'Tout éleveur ou producteur local : moutons (Tabaski), volaille, bovins, ainsi que les producteurs de produits du terroir (fruits, légumes, miel, lait…).'],
    ['Combien ça coûte ?', 'C’est gratuit. Vous activez votre profil éleveur avec votre position et apparaissez immédiatement sur la carte des éleveurs proches.'],
    ['Comment les acheteurs me trouvent-ils ?', 'Les acheteurs proches voient votre fiche sur la carte « Éleveurs près de moi » et vous contactent directement par WhatsApp ou téléphone.'],
  ];

  const graph = JSON.stringify({
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'WebPage', name: title, description: desc, url, inLanguage: 'fr', isPartOf: { '@type': 'WebSite', name: 'NEXUS Market Sénégal', url: origin } },
      { '@type': 'BreadcrumbList', itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Accueil', item: `${origin}/` },
        { '@type': 'ListItem', position: 2, name: 'Devenir éleveur', item: url },
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
:root{--green:#00853E}
*{box-sizing:border-box}body{font-family:system-ui,-apple-system,'Segoe UI',Roboto,Arial,sans-serif;margin:0;color:#1F2937;line-height:1.6;background:#fff}
.wrap{max-width:820px;margin:0 auto;padding:1.2rem 1rem 3rem}
.crumb{font-size:.8rem;color:#6B7280;margin-bottom:1rem}.crumb a{color:var(--green);text-decoration:none}
.hero{background:linear-gradient(135deg,#00853E,#0aa85a);color:#fff;border-radius:20px;padding:2.2rem 1.5rem;text-align:center}
.hero h1{font-size:clamp(1.5rem,5vw,2.3rem);margin:0 0 .6rem;font-weight:900}
.hero p{margin:0 auto;max-width:560px;opacity:.95}
.cta{display:inline-block;background:#FDEF42;color:#1a1a1a;padding:14px 32px;border-radius:10px;text-decoration:none;font-weight:800;margin-top:1.3rem;font-size:1.05rem}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:1rem;margin:2rem 0}
.card{border:1px solid #e5e7eb;border-radius:14px;padding:1.1rem}
.card .e{font-size:1.8rem}.card h3{margin:.5rem 0 .3rem;font-size:1rem}.card p{margin:0;font-size:.9rem;color:#6B7280}
h2{font-size:1.3rem;margin-top:2rem}
.faq{border-top:1px solid #eee;margin-top:1rem}.faq details{border-bottom:1px solid #eee;padding:.8rem 0}.faq summary{font-weight:700;cursor:pointer}
.foot{color:#9CA3AF;font-size:.82rem;margin-top:2.5rem;text-align:center}
.center{text-align:center;margin-top:2rem}
</style>
</head><body><div class="wrap">
<nav class="crumb"><a href="${esc(origin)}/">Accueil</a> › <span>Devenir éleveur</span></nav>
<section class="hero">
  <h1>🐏 Vendez votre bétail & vos produits locaux</h1>
  <p>Éleveurs et producteurs du terroir : rejoignez NEXUS, apparaissez sur la carte des éleveurs proches et vendez en direct aux acheteurs du Sénégal.</p>
  <a class="cta" href="${esc(origin)}/?register=breeder">Activer mon profil éleveur →</a>
</section>

<div class="grid">
  ${benefits.map(([e, t, d]) => `<div class="card"><div class="e">${e}</div><h3>${esc(t)}</h3><p>${esc(d)}</p></div>`).join('')}
</div>

<h2>Questions fréquentes</h2>
<div class="faq">
  ${faq.map(([q, a]) => `<details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join('')}
</div>

<div class="center">
  <a class="cta" href="${esc(origin)}/?register=breeder" style="background:#00853E;color:#fff">🚀 Je m’inscris comme éleveur</a>
</div>

<p class="foot">NEXUS Market — La marketplace du Sénégal. Artisans, vendeurs, éleveurs et livreurs réunis sur une seule plateforme.</p>
</div></body></html>`;

  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=3600' },
  });
}
