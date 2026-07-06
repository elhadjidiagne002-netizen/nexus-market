// functions/faq.js → /faq
// Page FAQ server-rendered (contenu VISIBLE) + JSON-LD FAQPage. Indispensable
// pour que le rich snippet FAQ de Google soit éligible : le balisage FAQPage
// doit refléter un contenu réellement visible sur la page.
import { esc } from './_lib/seo.js';

const FAQ = [
  { section: 'Paiement' },
  { q: 'Comment payer sur NEXUS Market ?',
    a: 'Vous pouvez payer avec Orange Money, Wave ou par carte bancaire (Visa/Mastercard). Tous les paiements sont sécurisés et protégés par la garantie acheteur NEXUS : votre argent n’est versé au vendeur qu’après confirmation de la commande.' },
  { q: 'Le paiement à la livraison est-il possible ?',
    a: 'Oui, selon le vendeur : l’option « paiement à la livraison » (COD) s’affiche au moment de la commande si elle est proposée pour cet article.' },
  { q: 'Que se passe-t-il si mon paiement échoue ?',
    a: 'Aucune somme n’est débitée en cas d’échec. Réessayez avec un autre moyen de paiement ou contactez votre opérateur mobile money si le problème persiste.' },
  { q: 'Orange Money ou Wave : lequel choisir ?',
    a: 'Les deux fonctionnent de façon similaire sur NEXUS. Notre guide comparatif détaille les frais et la couverture de chaque service : voir « Orange Money ou Wave : lequel choisir ? ».' },

  { section: 'Livraison' },
  { q: 'La livraison est-elle disponible partout au Sénégal ?',
    a: 'Oui, NEXUS Market livre partout au Sénégal — Dakar, Thiès, Saint-Louis, Touba et toutes les régions. Les délais et frais dépendent du vendeur et de votre ville.' },
  { q: 'Combien coûte la livraison ?',
    a: 'Le tarif dépend de la zone et du poids du colis ; il est calculé et affiché avant la validation de la commande.' },
  { q: 'Puis-je suivre ma commande en temps réel ?',
    a: 'Oui, un numéro de suivi est généré à la confirmation de commande, consultable depuis « Mes commandes ».' },
  { q: 'Puis-je faire appel à un coursier pour une livraison urgente ?',
    a: 'Oui, NEXUS Coursier permet de faire livrer un colis en quelques minutes à Dakar, avec suivi GPS en direct.' },

  { section: 'Achats & protection' },
  { q: 'Mes achats sont-ils protégés ?',
    a: 'Oui. La protection acheteur NEXUS sécurise chaque transaction et les litiges sont résolus sous 24h. Votre argent n’est libéré au vendeur qu’après confirmation de la bonne réception de la commande.' },
  { q: 'C’est mon premier achat : suis-je couvert ?',
    a: 'Oui — avec le « Premier achat garanti », si votre toute première commande payée sur NEXUS est victime d’une fraude avérée, nous vous remboursons intégralement (réclamation sous 48h, transaction réglée via la plateforme). De quoi acheter en ligne en toute confiance.' },
  { q: 'Comment signaler un problème avec une commande ?',
    a: 'Ouvrez un litige directement depuis la commande concernée dans « Mes commandes » : un conseiller NEXUS examine la situation sous 24h.' },
  { q: 'Puis-je retourner un article qui ne convient pas ?',
    a: 'Oui, sous 30 jours et si l’article n’a pas été utilisé, conformément à la garantie « satisfait ou remboursé » de NEXUS.' },
  { q: 'Comment reconnaître une annonce frauduleuse ?',
    a: 'Méfiez-vous des prix anormalement bas et des demandes de paiement hors plateforme. Voir notre guide « Éviter les arnaques en ligne » pour les réflexes essentiels.' },

  { section: 'Vendre sur NEXUS' },
  { q: 'Comment vendre sur NEXUS Market ?',
    a: 'Vous pouvez publier une annonce express en 2 minutes sans créer de compte, ou ouvrir une boutique vendeur pour gérer vos produits, commandes et paiements depuis un tableau de bord complet.' },
  { q: 'Quels sont les frais pour les vendeurs ?',
    a: 'La publication d’annonces est gratuite. NEXUS prélève une commission sur les ventes conclues via la plateforme (réduite pour les vendeurs parrainés). Aucun frais caché.' },
  { q: 'Comment suis-je payé en tant que vendeur ?',
    a: 'Les paiements des acheteurs sont sécurisés par NEXUS puis reversés au vendeur après confirmation de la livraison, selon les modalités de votre tableau de bord vendeur.' },
  { q: 'Puis-je vendre du contenu numérique (PDF, eBook) ?',
    a: 'Oui, les produits numériques (livres, eBooks) sont téléversés directement et deviennent téléchargeables par l’acheteur dès le paiement confirmé.' },

  { section: 'Fonctionnalités NEXUS' },
  { q: 'NEXUS Market est-il disponible en Wolof ?',
    a: 'Oui, l’interface est disponible en Français, en Wolof et en Anglais — NEXUS est la première marketplace sénégalaise nativement en Wolof.' },
  { q: 'Qu’est-ce que NEXUS Pro ?',
    a: 'NEXUS Pro permet de trouver un artisan ou un ouvrier (plombier, électricien, maçon…) géolocalisé près de chez vous.' },
  { q: 'Qu’est-ce que NEXUS Élevage ?',
    a: 'Un espace dédié aux éleveurs et producteurs locaux : moutons de Tabaski, volaille, bétail et produits du terroir, en contact direct.' },
  { q: 'Qu’est-ce que le Louma NEXUS ?',
    a: 'L’édition hebdomadaire (le vendredi) de la marketplace, avec une sélection mise en avant de vendeurs et d’offres, à l’image des marchés traditionnels sénégalais.' },
  { q: 'Qu’est-ce que NEXUS Troc ?',
    a: 'Un espace pour échanger des objets en bon état sans transaction financière, entre particuliers.' },
  { q: 'Qu’est-ce que NEXUS Location ?',
    a: 'Un service pour louer du matériel (événementiel, BTP, électroménager) plutôt que l’acheter, en contact direct avec le loueur.' },
  { q: 'Comment fonctionne le programme de fidélité ?',
    a: 'Chaque achat rapporte des points qui débloquent des avantages (livraison gratuite, accès anticipé aux ventes flash) selon votre palier.' },
  { q: 'Comment contacter le support NEXUS Market ?',
    a: 'Via la page Contact, le chat communauté, ou par email — les coordonnées complètes sont disponibles sur notre page Contact.' },
];

export async function onRequest({ request, env }) {
  const origin = env.SITE_URL || new URL(request.url).origin;
  const url = `${origin}/faq`;

  const questions = FAQ.filter(f => f.q);
  const jsonld = {
    '@context': 'https://schema.org', '@type': 'FAQPage',
    mainEntity: questions.map(f => ({
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

  const items = FAQ.map(f => f.section
    ? `<h2 class="section">${esc(f.section)}</h2>`
    : `<section class="qa"><h3>${esc(f.q)}</h3><p>${esc(f.a)}</p></section>`
  ).join('');

  const html = `<!DOCTYPE html><html lang="fr"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>FAQ — Questions fréquentes · NEXUS Market Sénégal</title>
<meta name="description" content="Foire aux questions NEXUS Market : paiement Orange Money & Wave, livraison au Sénégal, protection acheteur, vendre en ligne, NEXUS Pro, Élevage, Louma, Troc, Location et programme de fidélité.">
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
<style>body{font-family:Arial,Helvetica,sans-serif;max-width:760px;margin:0 auto;padding:24px;color:#1F2937;line-height:1.65}a{color:#00853E;text-decoration:none;font-weight:700}.crumb{font-size:.8rem;color:#6B7280;margin-bottom:1rem}h1{font-size:1.7rem;color:#00853E;margin:.3rem 0 1.2rem}h2.section{font-size:1.05rem;color:#00853E;margin:1.8rem 0 .3rem;text-transform:uppercase;letter-spacing:.04em}.qa{border-bottom:1px solid #E5E7EB;padding:1rem 0}.qa h3{font-size:1.05rem;margin:0 0 .4rem}.qa p{margin:0;color:#374151}.cta{display:inline-block;background:#00853E;color:#fff;padding:12px 26px;border-radius:8px;margin-top:1.6rem}.foot{color:#9CA3AF;font-size:.8rem;margin-top:2.2rem}</style>
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
