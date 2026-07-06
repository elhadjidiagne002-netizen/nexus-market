// functions/coursier.js → /coursier — hub SEO du service Coursier à la demande.
import { renderContentPage, contentResponse } from './_lib/contentpage.js';

export async function onRequest({ request, env }) {
  const origin = env.SITE_URL || new URL(request.url).origin;
  const appUrl = `${origin}/?courier=1`;

  const benefits = [
    ['🛵', 'Livraison en quelques minutes', 'Un coursier proche de vous prend en charge la course immédiatement.'],
    ['📍', 'Suivi GPS en direct', 'Suivez votre coursier en temps réel jusqu’à la remise.'],
    ['💬', 'Contact direct', 'Échangez directement avec votre coursier pour les instructions de remise.'],
    ['💳', 'Paiement flexible', 'Réglez la course en Orange Money, Wave, carte ou à la livraison.'],
  ];
  const steps = [
    ['1', 'Indiquez le trajet', 'Renseignez l\'adresse de collecte et de livraison dans l\'application.'],
    ['2', 'Un coursier accepte', 'Le coursier disponible le plus proche prend en charge votre course.'],
    ['3', 'Suivez en direct', 'La position du coursier s\'affiche sur la carte jusqu\'à la remise.'],
    ['4', 'Confirmez la réception', 'Le destinataire confirme la remise ; vous réglez selon le mode choisi.'],
  ];
  const useCases = [
    ['🛍️', 'Achat en boutique', 'Faites récupérer et livrer un article acheté chez un commerçant qui ne livre pas lui-même.'],
    ['📄', 'Documents urgents', 'Contrat, dossier administratif, clé USB : un coursier les achemine en quelques minutes.'],
    ['🍲', 'Repas et courses', 'Faites livrer un repas ou de petites courses depuis un marché ou un restaurant.'],
    ['🎁', 'Cadeau ou colis', 'Envoyez un colis à un proche à l\'autre bout de la ville sans vous déplacer.'],
  ];
  const faq = [
    ['Comment commander un coursier ?', 'Ouvrez NEXUS Market, indiquez le point de collecte et de livraison : un coursier proche accepte la course et vous suivez sa position en direct.'],
    ['Dans quelles villes le service est-il disponible ?', 'Le service est actif à Dakar et s’étend progressivement aux autres villes du Sénégal.'],
    ['Combien coûte une course ?', 'Le tarif dépend de la distance et de la zone. Le prix est affiché avant la confirmation de la course.'],
    ['Que se passe-t-il si le coursier n\'arrive pas ?', 'La course est automatiquement réattribuée à un autre coursier disponible via le système de cascade d\'offres NEXUS.'],
    ['Puis-je suivre plusieurs colis en même temps ?', 'Oui, chaque course a son propre suivi GPS et son propre numéro, consultable depuis « Mes livraisons ».'],
    ['Le coursier peut-il transporter des objets fragiles ?', 'Précisez la nature du colis lors de la commande : le coursier adapte le transport (sac isotherme, précautions) en conséquence.'],
  ];

  const body = `
<h1>🛵 Coursier à la demande</h1>
<p class="lead">Besoin de faire livrer un colis, un document ou un achat en quelques minutes à Dakar ? NEXUS Coursier met en relation un livreur proche de vous, avec un suivi GPS en direct jusqu’à la remise.</p>
<a class="cta" href="${appUrl}">Commander un coursier →</a>
<div class="cards">
${benefits.map(([e, t, d]) => `<div class="card"><h3>${e} ${t}</h3><p>${d}</p></div>`).join('')}
</div>
<h2>Comment ça marche</h2>
<div class="cards">
${steps.map(([n, t, d]) => `<div class="card"><h3>${n}. ${t}</h3><p>${d}</p></div>`).join('')}
</div>
<h2>Cas d'usage courants</h2>
<div class="cards">
${useCases.map(([e, t, d]) => `<div class="card"><h3>${e} ${t}</h3><p>${d}</p></div>`).join('')}
</div>
<h2>Questions fréquentes</h2>
${faq.map(([q, a]) => `<h3>${q}</h3><p>${a}</p>`).join('')}
<p>Vous voulez devenir coursier et livrer avec NEXUS ? Consultez notre guide : <a href="${origin}/guide/devenir-coursier-livreur-dakar">devenir coursier / livreur à Dakar</a>. Pour vos frais de livraison classiques, voir aussi <a href="${origin}/guide/comprendre-frais-livraison-dakar">comprendre les frais de livraison à Dakar</a>.</p>
<a class="cta" href="${appUrl}">Commander un coursier →</a>`;

  return contentResponse(renderContentPage({
    origin, path: '/coursier',
    title: 'Coursier à la demande à Dakar — livraison express en quelques minutes',
    description: 'Commandez un coursier à la demande sur NEXUS Market : suivi GPS en direct, contact direct et paiement flexible pour vos livraisons express à Dakar.',
    h1: 'Coursier à la demande', crumbName: 'Coursier', isArticle: false,
    extraGraph: [{
      '@type': 'FAQPage',
      mainEntity: faq.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })),
    }],
    bodyHtml: body,
  }));
}
