// functions/blog/ramadan-senegal-preparer-achats-budget.js
import { renderContentPage, contentResponse } from '../_lib/contentpage.js';

export async function onRequest({ request, env }) {
  const origin = env.SITE_URL || new URL(request.url).origin;
  const faq = {
    '@type': 'FAQPage',
    mainEntity: [
      { '@type': 'Question', name: 'Faut-il faire ses courses de Ramadan en une fois ou étaler les achats ?', acceptedAnswer: { '@type': 'Answer', text: 'Étaler les achats sur les semaines précédentes permet souvent de mieux gérer son budget et d\'éviter la hausse des prix constatée juste avant le début du mois.' } },
      { '@type': 'Question', name: 'Quels produits anticiper en priorité pour le Ramadan ?', acceptedAnswer: { '@type': 'Answer', text: 'Les denrées de base (dattes, céréales, produits laitiers) sont les plus demandées et voient leurs prix augmenter en premier — les anticiper tôt permet de mieux maîtriser son budget.' } },
    ],
  };
  const body = `
<h1>Ramadan au Sénégal : bien préparer ses achats et son budget</h1>
<p class="lead">Entre les courses alimentaires pour la rupture du jeûne et les préparatifs pour la Korité en fin de mois, le Ramadan demande une bonne organisation budgétaire. Voici comment s'y prendre.</p>

<div class="tldr">
<h2>À retenir</h2>
<ul>
  <li>Étalez vos achats sur les semaines précédentes pour éviter la hausse des prix de dernière minute.</li>
  <li>Anticipez en priorité les denrées de base (dattes, céréales, lait) qui voient leur prix grimper les premières.</li>
  <li>Prévoyez un budget séparé pour les préparatifs de la Korité en fin de mois.</li>
</ul>
</div>

<h2>1. Anticiper plutôt que subir la hausse des prix</h2>
<p>Les prix de nombreuses denrées de base augmentent à l'approche du Ramadan, sous l'effet de la demande. Acheter vos produits non périssables (céréales, dattes, huile) plusieurs semaines à l'avance permet souvent d'économiser significativement sur l'ensemble du mois.</p>

<h2>2. Un budget en deux temps</h2>
<table>
<thead><tr><th>Période</th><th>Postes de dépense</th></tr></thead>
<tbody>
<tr><td>Pendant le mois</td><td>Alimentation pour la rupture du jeûne, produits de base</td></tr>
<tr><td>Fin de mois (Korité)</td><td>Tenues, cadeaux, repas de fête — voir notre guide dédié</td></tr>
</tbody>
</table>

<h2>3. Où bien acheter</h2>
<p>NEXUS Market référence des produits alimentaires locaux et des annonces de vendeurs dans plusieurs villes du Sénégal. Consultez la <a href="${origin}/categorie/alimentation">catégorie Alimentation</a> pour comparer les prix avant de faire vos réserves.</p>

<a class="cta" href="${origin}/categorie/alimentation">Voir les produits alimentaires →</a>
<p style="margin-top:1.4rem">Voir aussi : <a href="${origin}/blog">Tous les articles du blog</a> · <a href="${origin}/blog/korite-tenues-cadeaux-preparatifs">Korité : tenues, cadeaux et préparatifs</a></p>`;

  return contentResponse(renderContentPage({
    origin, path: '/blog/ramadan-senegal-preparer-achats-budget',
    title: 'Ramadan au Sénégal : bien préparer ses achats et son budget',
    description: 'Comment anticiper ses achats pour le Ramadan au Sénégal et éviter la hausse des prix de dernière minute.',
    h1: 'Ramadan au Sénégal : bien préparer ses achats et son budget', crumbName: 'Blog — Ramadan',
    isArticle: true, datePublished: '2026-08-19', bodyHtml: body, extraGraph: [faq],
  }));
}
