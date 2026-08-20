// functions/blog/reperer-fausse-annonce-vendeur-non-fiable.js
import { renderContentPage, contentResponse } from '../_lib/contentpage.js';

export async function onRequest({ request, env }) {
  const origin = env.SITE_URL || new URL(request.url).origin;
  const faq = {
    '@type': 'FAQPage',
    mainEntity: [
      { '@type': 'Question', name: 'Un prix très bas est-il toujours suspect ?', acceptedAnswer: { '@type': 'Answer', text: 'Pas automatiquement, mais un prix nettement en dessous du marché pour un produit demandé (électronique récente, notamment) mérite une vérification supplémentaire avant de payer quoi que ce soit.' } },
      { '@type': 'Question', name: 'Que faire si un vendeur demande un paiement avant toute livraison ?', acceptedAnswer: { '@type': 'Answer', text: 'Privilégiez toujours un circuit qui protège l\'acheteur (paiement sécurisé avec recours possible) plutôt qu\'un virement direct à un inconnu sans aucune garantie.' } },
    ],
  };
  const body = `
<h1>Comment repérer une fausse annonce ou un vendeur non fiable</h1>
<p class="lead">La grande majorité des vendeurs en ligne sont honnêtes, mais quelques signaux permettent de repérer rapidement une annonce ou un vendeur à éviter.</p>

<div class="tldr">
<h2>À retenir</h2>
<ul>
  <li>Un prix anormalement bas pour un produit demandé mérite une vérification supplémentaire.</li>
  <li>Méfiez-vous des vendeurs qui refusent tout contact avant paiement ou pressent une décision rapide.</li>
  <li>Privilégiez toujours un circuit de paiement qui vous protège en cas de problème.</li>
</ul>
</div>

<h2>1. Les signaux d'alerte à connaître</h2>
<ul>
  <li><strong>Prix nettement inférieur au marché</strong> sans explication claire (déstockage, urgence de vente réelle).</li>
  <li><strong>Photos visiblement reprises d'un autre site</strong> ou de mauvaise qualité pour un produit cher.</li>
  <li><strong>Refus de répondre aux questions</strong> ou insistance excessive pour conclure rapidement.</li>
  <li><strong>Demande de paiement direct</strong> hors de tout circuit sécurisé, avant toute livraison.</li>
</ul>

<h2>2. Les bons réflexes avant d'acheter</h2>
<p>Posez des questions précises sur le produit, demandez des photos supplémentaires si besoin, et privilégiez un paiement qui vous protège plutôt qu'un virement ou dépôt direct sans recours possible. Voir notre guide complet <a href="${origin}/blog/eviter-arnaques-achats-en-ligne-senegal">éviter les arnaques en ligne</a> pour plus de détails.</p>

<h2>3. La protection acheteur NEXUS Market</h2>
<p>Sur NEXUS Market, les paiements passent par des circuits sécurisés avec une protection acheteur en cas de litige — voir notre page <a href="${origin}/blog/garantie-retour-remboursement-marketplace-senegal">garantie, retour et remboursement</a>.</p>

<a class="cta" href="${origin}/">Découvrir NEXUS Market →</a>
<p style="margin-top:1.4rem">Voir aussi : <a href="${origin}/blog">Tous les articles du blog</a> · <a href="${origin}/blog/payer-carte-bancaire-en-ligne-securite-senegal">Payer par carte bancaire en ligne : est-ce sécurisé ?</a></p>`;

  return contentResponse(renderContentPage({
    origin, path: '/blog/reperer-fausse-annonce-vendeur-non-fiable',
    title: 'Comment repérer une fausse annonce ou un vendeur non fiable',
    description: 'Les signaux d\'alerte pour reconnaître une fausse annonce ou un vendeur non fiable en ligne, et comment acheter sereinement.',
    h1: 'Comment repérer une fausse annonce ou un vendeur non fiable', crumbName: 'Blog — Éviter les arnaques',
    isArticle: true, datePublished: '2026-08-19', bodyHtml: body, extraGraph: [faq],
  }));
}
