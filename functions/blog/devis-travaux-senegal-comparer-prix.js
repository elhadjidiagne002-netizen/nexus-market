// functions/blog/devis-travaux-senegal-comparer-prix.js
import { renderContentPage, contentResponse } from '../_lib/contentpage.js';

export async function onRequest({ request, env }) {
  const origin = env.SITE_URL || new URL(request.url).origin;
  const faq = {
    '@type': 'FAQPage',
    mainEntity: [
      { '@type': 'Question', name: 'Combien de devis faut-il comparer avant de choisir ?', acceptedAnswer: { '@type': 'Answer', text: 'Au moins 2 à 3 devis pour des travaux d\'une certaine ampleur, afin d\'avoir une vraie base de comparaison sur le prix et le détail des prestations.' } },
      { '@type': 'Question', name: 'Le prix le plus bas est-il toujours le meilleur choix ?', acceptedAnswer: { '@type': 'Answer', text: 'Pas nécessairement — un prix anormalement bas peut cacher des matériaux de moindre qualité ou des prestations non incluses. Comparez toujours le détail, pas seulement le total.' } },
    ],
  };
  const body = `
<h1>Devis travaux au Sénégal : comment comparer sans se faire avoir sur le prix</h1>
<p class="lead">Rénovation, construction, installation : comparer plusieurs devis est la meilleure protection contre les mauvaises surprises. Voici comment s'y prendre.</p>

<div class="tldr">
<h2>À retenir</h2>
<ul>
  <li>Demandez toujours un devis détaillé, pas juste un prix global.</li>
  <li>Comparez au moins 2 à 3 prestataires avant de choisir.</li>
  <li>Un prix nettement plus bas que les autres mérite une vérification, pas juste une préférence.</li>
</ul>
</div>

<h2>1. Ce que doit contenir un bon devis</h2>
<ul>
  <li><strong>Le détail des matériaux</strong> utilisés (qualité, quantité).</li>
  <li><strong>La main d'œuvre</strong> séparée du coût des matériaux.</li>
  <li><strong>Le délai d'exécution</strong> estimé.</li>
  <li><strong>Les conditions de paiement</strong> (acompte, solde à la livraison).</li>
</ul>

<h2>2. Comparer sans se tromper</h2>
<table>
<thead><tr><th>Point de comparaison</th><th>Pourquoi c'est important</th></tr></thead>
<tbody>
<tr><td>Détail des prestations incluses</td><td>Deux devis au même prix peuvent couvrir des choses très différentes</td></tr>
<tr><td>Expérience sur des travaux similaires</td><td>Réduit le risque de malfaçon</td></tr>
<tr><td>Délai proposé</td><td>Un délai irréaliste est souvent un signal d'alerte</td></tr>
</tbody>
</table>

<h2>3. Trouver plusieurs artisans pour comparer</h2>
<p>NEXUS Pro référence des artisans et ouvriers géolocalisés au Sénégal, avec leur tarif indicatif et leur expérience affichés sur chaque profil — pratique pour demander plusieurs devis rapidement.</p>

<a class="cta" href="${origin}/?pro=1">Trouver des artisans →</a>
<p style="margin-top:1.4rem">Voir aussi : <a href="${origin}/blog">Tous les articles du blog</a> · <a href="${origin}/blog/trouver-bon-plombier-electricien-dakar">Comment trouver un bon plombier ou électricien</a></p>`;

  return contentResponse(renderContentPage({
    origin, path: '/blog/devis-travaux-senegal-comparer-prix',
    title: 'Devis travaux au Sénégal : comment comparer sans se faire avoir sur le prix',
    description: 'Comparer des devis de travaux au Sénégal : ce qu\'il faut vérifier avant de choisir un artisan, au-delà du simple prix total.',
    h1: 'Devis travaux au Sénégal : comment comparer sans se faire avoir sur le prix', crumbName: 'Blog — Devis travaux',
    isArticle: true, datePublished: '2026-08-19', bodyHtml: body, extraGraph: [faq],
  }));
}
