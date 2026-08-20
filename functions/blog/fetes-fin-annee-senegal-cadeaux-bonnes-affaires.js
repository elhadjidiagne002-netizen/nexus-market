// functions/blog/fetes-fin-annee-senegal-cadeaux-bonnes-affaires.js
import { renderContentPage, contentResponse } from '../_lib/contentpage.js';

export async function onRequest({ request, env }) {
  const origin = env.SITE_URL || new URL(request.url).origin;
  const faq = {
    '@type': 'FAQPage',
    mainEntity: [
      { '@type': 'Question', name: 'Quand commencer ses achats de fin d\'année pour profiter des meilleurs prix ?', acceptedAnswer: { '@type': 'Answer', text: 'Dès le mois de novembre, avant la forte hausse de la demande de décembre — les articles les plus recherchés (électronique, jouets) partent vite et voient leur prix grimper en fin d\'année.' } },
      { '@type': 'Question', name: 'Comment fixer un budget cadeaux sans déraper ?', acceptedAnswer: { '@type': 'Answer', text: 'Listez à l\'avance les personnes à qui offrir un cadeau avec un montant maximum par personne, plutôt que d\'acheter au fil des envies pendant la période.' } },
    ],
  };
  const body = `
<h1>Fêtes de fin d'année au Sénégal : cadeaux et bonnes affaires</h1>
<p class="lead">Entre Noël, la Saint-Sylvestre et les cadeaux de nouvel an, la fin d'année est une période chargée pour le budget. Voici comment bien s'organiser.</p>

<div class="tldr">
<h2>À retenir</h2>
<ul>
  <li>Commencez vos achats dès novembre pour profiter de meilleurs prix avant la forte demande de décembre.</li>
  <li>Fixez un budget cadeaux par personne avant de commencer, plutôt qu'au fil des envies.</li>
  <li>Les articles électroniques et jouets sont les plus demandés — anticipez leur achat.</li>
</ul>
</div>

<h2>1. Anticiper pour économiser</h2>
<p>Les prix de nombreux articles (électronique, jouets, décoration) montent avec la demande à l'approche de décembre. Commencer ses achats plus tôt permet souvent d'avoir plus de choix et de meilleurs prix.</p>

<h2>2. Bien fixer son budget cadeaux</h2>
<p>Listez à l'avance les personnes à qui vous souhaitez offrir un cadeau, avec un montant maximum défini pour chacune. Cette méthode simple évite les dépenses impulsives qui s'accumulent vite pendant la période des fêtes.</p>

<h2>3. Où trouver de bonnes affaires</h2>
<p>NEXUS Market référence des produits dans toutes les catégories (électronique, mode, jouets, décoration) avec des annonces de particuliers et de vendeurs pro. Comparez les prix avant d'acheter, et pensez aussi à l'occasion pour certains articles.</p>

<a class="cta" href="${origin}/">Explorer le catalogue →</a>
<p style="margin-top:1.4rem">Voir aussi : <a href="${origin}/blog">Tous les articles du blog</a> · <a href="${origin}/blog/rentree-scolaire-fournitures-manuels-senegal">Rentrée scolaire : bons plans</a></p>`;

  return contentResponse(renderContentPage({
    origin, path: '/blog/fetes-fin-annee-senegal-cadeaux-bonnes-affaires',
    title: 'Fêtes de fin d\'année au Sénégal : cadeaux et bonnes affaires',
    description: 'Bien préparer son budget et ses achats de cadeaux pour les fêtes de fin d\'année au Sénégal.',
    h1: 'Fêtes de fin d\'année au Sénégal : cadeaux et bonnes affaires', crumbName: 'Blog — Fêtes de fin d\'année',
    isArticle: true, datePublished: '2026-08-19', bodyHtml: body, extraGraph: [faq],
  }));
}
