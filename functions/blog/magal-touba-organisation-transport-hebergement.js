// functions/blog/magal-touba-organisation-transport-hebergement.js
import { renderContentPage, contentResponse } from '../_lib/contentpage.js';

export async function onRequest({ request, env }) {
  const origin = env.SITE_URL || new URL(request.url).origin;
  const faq = {
    '@type': 'FAQPage',
    mainEntity: [
      { '@type': 'Question', name: 'Combien de temps à l\'avance réserver son transport pour le Magal ?', acceptedAnswer: { '@type': 'Answer', text: 'Le plus tôt possible — plusieurs semaines à l\'avance si possible, car la demande de transport vers Touba explose à l\'approche de l\'événement et les prix montent en conséquence.' } },
      { '@type': 'Question', name: 'Faut-il réserver un hébergement à Touba pour le Magal ?', acceptedAnswer: { '@type': 'Answer', text: 'De nombreux pèlerins sont hébergés par des familles ou des daaras, mais réserver un hébergement à l\'avance reste plus sûr si vous n\'avez pas de contact sur place.' } },
    ],
  };
  const body = `
<h1>Magal de Touba : comment s'organiser (transport, hébergement, budget)</h1>
<p class="lead">Le Grand Magal de Touba rassemble chaque année des millions de pèlerins. Une bonne organisation en amont évite bien des désagréments le jour J.</p>

<div class="tldr">
<h2>À retenir</h2>
<ul>
  <li>Réservez votre transport le plus tôt possible : les tarifs augmentent fortement à l'approche de l'événement.</li>
  <li>Anticipez votre hébergement si vous n'avez pas de contact sur place à Touba.</li>
  <li>Prévoyez un budget incluant transport, hébergement et provisions pour plusieurs jours.</li>
</ul>
</div>

<h2>1. Le transport, à anticiper en priorité</h2>
<p>Les lignes de bus et cars vers Touba sont très demandées à l'approche du Magal, avec des tarifs qui augmentent en conséquence. Comparez plusieurs compagnies et réservez tôt pour sécuriser votre place et un meilleur prix — voir notre guide <a href="${origin}/blog/choisir-ligne-transport-bus-car-ferry-senegal">comment bien choisir sa ligne de transport</a>.</p>

<h2>2. L'hébergement sur place</h2>
<p>De nombreux pèlerins sont accueillis par des familles ou des daaras locaux. Si vous n'avez pas de contact à Touba, anticipez une solution d'hébergement avant de partir plutôt que de chercher sur place le jour même.</p>

<h2>3. Le budget à prévoir</h2>
<table>
<thead><tr><th>Poste</th><th>À anticiper</th></tr></thead>
<tbody>
<tr><td>Transport aller-retour</td><td>Réserver tôt pour un meilleur tarif</td></tr>
<tr><td>Hébergement</td><td>Si pas de contact sur place</td></tr>
<tr><td>Provisions et repas</td><td>Prévoir pour plusieurs jours selon la durée du séjour</td></tr>
</tbody>
</table>

<h2>4. Trouver votre ligne de transport</h2>
<p>NEXUS Market référence les lignes de bus, car et transport régulier vers Touba et dans tout le Sénégal, avec leurs horaires et tarifs.</p>

<a class="cta" href="${origin}/covoiturage">Voir les lignes disponibles →</a>
<p style="margin-top:1.4rem">Voir aussi : <a href="${origin}/blog">Tous les articles du blog</a> · <a href="${origin}/blog/choisir-ligne-transport-bus-car-ferry-senegal">Bus, car ou ferry : bien choisir sa ligne de transport</a></p>`;

  return contentResponse(renderContentPage({
    origin, path: '/blog/magal-touba-organisation-transport-hebergement',
    title: 'Magal de Touba : comment s\'organiser (transport, hébergement, budget)',
    description: 'Bien préparer le Grand Magal de Touba : réserver son transport à l\'avance, anticiper l\'hébergement et prévoir son budget.',
    h1: 'Magal de Touba : comment s\'organiser (transport, hébergement, budget)', crumbName: 'Blog — Magal de Touba',
    isArticle: true, datePublished: '2026-08-19', bodyHtml: body, extraGraph: [faq],
  }));
}
