// functions/blog/programme-fidelite-nexus-points-paliers.js
import { renderContentPage, contentResponse } from '../_lib/contentpage.js';

export async function onRequest({ request, env }) {
  const origin = env.SITE_URL || new URL(request.url).origin;
  const faq = {
    '@type': 'FAQPage',
    mainEntity: [
      { '@type': 'Question', name: 'Comment gagne-t-on des points de fidélité sur NEXUS Market ?', acceptedAnswer: { '@type': 'Answer', text: 'Vous gagnez des points à chaque achat, en fonction du montant dépensé et de votre palier de fidélité (le multiplicateur augmente avec le palier).' } },
      { '@type': 'Question', name: 'Quel est le nombre minimum de points pour les utiliser ?', acceptedAnswer: { '@type': 'Answer', text: 'Il faut un minimum de 500 points cumulés avant de pouvoir les utiliser sur un prochain achat.' } },
      { '@type': 'Question', name: 'Comment monter de palier de fidélité ?', acceptedAnswer: { '@type': 'Answer', text: 'Votre palier dépend de votre total de points cumulés depuis le début (Bronze, Argent, Or, Platine) — plus vous achetez, plus votre multiplicateur de gain augmente.' } },
    ],
  };
  const body = `
<h1>Programme de fidélité NEXUS : comment gagner et utiliser vos points</h1>
<p class="lead">Chaque achat sur NEXUS Market vous fait gagner des points de fidélité, avec des avantages qui augmentent selon votre palier. Voici comment ça fonctionne concrètement.</p>

<div class="tldr">
<h2>À retenir</h2>
<ul>
  <li>Vous gagnez des points à chaque achat, avec un multiplicateur qui augmente selon votre palier de fidélité.</li>
  <li>500 points minimum sont nécessaires avant de pouvoir les utiliser.</li>
  <li>Plus votre palier est élevé, plus vos avantages sont importants (livraison gratuite, accès prioritaire aux ventes flash).</li>
</ul>
</div>

<h2>1. Les 4 paliers de fidélité</h2>
<table>
<thead><tr><th>Palier</th><th>Seuil de points</th><th>Multiplicateur de gain</th><th>Avantages</th></tr></thead>
<tbody>
<tr><td>🥉 Bronze</td><td>0 - 999 pts</td><td>x1</td><td>Ventes flash 1h avant l'ouverture</td></tr>
<tr><td>🥈 Argent</td><td>1 000 - 4 999 pts</td><td>x1,5</td><td>Livraison gratuite dès 10 000 FCFA, ventes flash 2h avant</td></tr>
<tr><td>🥇 Or</td><td>5 000 - 14 999 pts</td><td>x2</td><td>Livraison gratuite dès 5 000 FCFA, support prioritaire, cadeau anniversaire</td></tr>
<tr><td>💎 Platine</td><td>15 000 pts et +</td><td>x3</td><td>Livraison gratuite illimitée, gestionnaire dédié, accès exclusif</td></tr>
</tbody>
</table>

<h2>2. Comment sont calculés vos points</h2>
<p>Vous gagnez des points en fonction du montant de vos achats, multiplié par le coefficient de votre palier actuel. Plus vous achetez régulièrement, plus vous montez de palier et plus chaque futur achat rapporte de points — un cercle vertueux pour les acheteurs fidèles.</p>

<h2>3. Utiliser vos points</h2>
<p>Une fois 500 points cumulés minimum, vous pouvez les utiliser pour réduire le montant d'un prochain achat. Consultez votre solde de points et votre palier actuel directement depuis votre compte NEXUS Market.</p>

<a class="cta" href="${origin}/fidelite">Voir mon programme fidélité →</a>
<p style="margin-top:1.4rem">Voir aussi : <a href="${origin}/blog">Tous les articles du blog</a> · <a href="${origin}/blog/programme-ambassadeur-nexus-parrainage">Programme Ambassadeur : gagner en parrainant</a></p>`;

  return contentResponse(renderContentPage({
    origin, path: '/blog/programme-fidelite-nexus-points-paliers',
    title: 'Programme de fidélité NEXUS : comment gagner et utiliser vos points',
    description: 'Comprendre le programme de fidélité NEXUS Market : paliers Bronze à Platine, gain de points et avantages associés.',
    h1: 'Programme de fidélité NEXUS : comment gagner et utiliser vos points', crumbName: 'Blog — Fidélité',
    isArticle: true, datePublished: '2026-08-19', bodyHtml: body, extraGraph: [faq],
  }));
}
