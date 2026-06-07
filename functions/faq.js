// functions/faq.js → /faq
// Page FAQ server-rendered (contenu VISIBLE) + JSON-LD FAQPage. Indispensable
// pour que le rich snippet FAQ de Google soit éligible : le balisage FAQPage
// doit refléter un contenu réellement visible sur la page.
import { esc } from './_lib/seo.js';

const FAQ = [
  { q: 'Comment payer sur NEXUS Market ?',
    a: 'Vous pouvez payer avec Orange Money, Wave ou par carte bancaire (Visa/Mastercard). Tous les paiements sont sécurisés et protégés par la garantie acheteur NEXUS : votre argent n’est versé au vendeur qu’après confirmation de la commande.' },
  { q: 'La livraison est-elle disponible partout au Sénégal ?',
    a: 'Oui, NEXUS Market livre partout au Sénégal — Dakar, Thiès, Saint-Louis, Touba et toutes les régions. Les délais et frais dépendent du vendeur et de votre ville.' },
  { q: 'Comment vendre sur NEXUS Market ?',
    a: 'Vous pouvez publier une annonce express en 2 minutes sans créer de compte, ou ouvrir une boutique vendeur pour gérer vos produits, commandes et paiements depuis un tableau de bord complet.' },
  { q: 'Mes achats sont-ils protégés ?',
    a: 'Oui. La protection acheteur NEXUS sécurise chaque transaction et les litiges sont résolus sous 24h. Votre argent n’est libéré au vendeur qu’après confirmation de la bonne réception de la commande.' },
  { q: 'C’est mon premier achat : suis-je couvert ?',
    a: 'Oui — avec le « Premier achat garanti », si votre toute première commande payée sur NEXUS est victime d’une fraude avérée, nous vous remboursons intégralement (réclamation sous 48h, transaction réglée via la plateforme). De quoi acheter en ligne en toute confiance.' },
  { q: 'Quels sont les frais pour les vendeurs ?',
    a: 'La publication d’annonces est gratuite. NEXUS prélève une commission sur les ventes conclues via la plateforme (réduite pour les vendeurs parrainés). Aucun frais caché.' },
  { q: 'NEXUS Market est-il disponible en Wolof ?',
    a: 'Oui, l’interface est disponible en Français, en Wolof et en Anglais — NEXUS est la première marketplace sénégalaise nativement en Wolof.' },
];

export async function onRequest({ request, env }) {
  const origin = env.SITE_URL || new URL(request.url).origin;
  const url = `${origin}/faq`;

  const jsonld = {
    '@context': 'https://schema.org', '@type': 'FAQPage',
    mainEntity: FAQ.map(f => ({
      '@type': 'Question', name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  };
  const breadcrumb = {
    '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Accueil', item: `${origin}/` },
      { '@type': 'ListItem', position: 2, name: 'FAQ', item: url },
    ],
  };
  const ld = (o) => `<script type="application/ld+json">${JSON.stringify(o).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026')}</script>`;

  const items = FAQ.map(f =>
    `<section class="qa"><h2>${esc(f.q)}</h2><p>${esc(f.a)}</p></section>`).join('');

  const html = `<!DOCTYPE html><html lang="fr"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>FAQ — Questions fréquentes · NEXUS Market Sénégal</title>
<meta name="description" content="Foire aux questions NEXUS Market : paiement Orange Money & Wave, livraison au Sénégal, protection acheteur, vendre en ligne, frais vendeurs, interface Wolof.">
<link rel="canonical" href="${esc(url)}">
<link rel="alternate" hreflang="fr" href="${esc(url)}">
<link rel="alternate" hreflang="x-default" href="${esc(url)}">
<meta name="robots" content="index, follow, max-image-preview:large">
<meta property="og:type" content="website">
<meta property="og:title" content="FAQ — NEXUS Market Sénégal">
<meta property="og:description" content="Toutes les réponses : paiement, livraison, protection acheteur, vente en ligne au Sénégal.">
<meta property="og:url" content="${esc(url)}">
<meta property="og:image" content="${origin}/og-image.png">
<meta property="og:site_name" content="NEXUS Market Sénégal">
${ld(jsonld)}
${ld(breadcrumb)}
<style>body{font-family:Arial,Helvetica,sans-serif;max-width:760px;margin:0 auto;padding:24px;color:#1F2937;line-height:1.65}a{color:#00853E;text-decoration:none;font-weight:700}.crumb{font-size:.8rem;color:#6B7280;margin-bottom:1rem}h1{font-size:1.7rem;color:#00853E;margin:.3rem 0 1.2rem}.qa{border-bottom:1px solid #E5E7EB;padding:1rem 0}.qa h2{font-size:1.1rem;margin:0 0 .4rem}.qa p{margin:0;color:#374151}.cta{display:inline-block;background:#00853E;color:#fff;padding:12px 26px;border-radius:8px;margin-top:1.6rem}.foot{color:#9CA3AF;font-size:.8rem;margin-top:2.2rem}</style>
</head><body>
<nav class="crumb"><a href="${esc(origin)}/">Accueil</a> › <span>FAQ</span></nav>
<h1>Questions fréquentes</h1>
${items}
<a class="cta" href="${esc(origin)}/">Explorer la marketplace NEXUS →</a>
<p class="foot">NEXUS Market — Marketplace sécurisée au Sénégal · Orange Money · Wave · Livraison partout.</p>
</body></html>`;

  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=3600' },
  });
}
