// functions/blog/nexus-stories-decouvrir-publier-videos-vente.js
import { renderContentPage, contentResponse } from '../_lib/contentpage.js';

export async function onRequest({ request, env }) {
  const origin = env.SITE_URL || new URL(request.url).origin;
  const faq = {
    '@type': 'FAQPage',
    mainEntity: [
      { '@type': 'Question', name: 'Combien de temps dure une Story sur NEXUS Market ?', acceptedAnswer: { '@type': 'Answer', text: 'Comme sur les réseaux sociaux, une Story reste visible temporairement — l\'idéal pour montrer un produit en conditions réelles, un déstockage ou une nouveauté du moment.' } },
      { '@type': 'Question', name: 'Faut-il du matériel professionnel pour filmer une Story produit ?', acceptedAnswer: { '@type': 'Answer', text: 'Non, un smartphone avec une bonne lumière naturelle suffit largement pour une vidéo courte et efficace.' } },
    ],
  };
  const body = `
<h1>NEXUS Stories : découvrir et publier des vidéos de vente</h1>
<p class="lead">Une photo statique ne montre pas toujours tout. Les Stories NEXUS Market permettent de présenter un produit en vidéo courte, un format qui inspire davantage confiance aux acheteurs.</p>

<div class="tldr">
<h2>À retenir</h2>
<ul>
  <li>Une vidéo courte montre mieux l'état réel d'un produit qu'une simple photo.</li>
  <li>Un smartphone et une bonne lumière naturelle suffisent pour filmer une Story efficace.</li>
  <li>Les Stories sont particulièrement utiles pour les déstockages et les nouveautés.</li>
</ul>
</div>

<h2>1. Pourquoi filmer plutôt que photographier ?</h2>
<p>Une vidéo permet de montrer un produit sous plusieurs angles, de démontrer son fonctionnement (pour un appareil électronique par exemple), et de rassurer l'acheteur sur son état réel — un avantage particulièrement utile pour les articles d'occasion.</p>

<h2>2. Bien filmer sa Story produit</h2>
<ul>
  <li><strong>Lumière naturelle</strong> : filmez près d'une fenêtre plutôt qu'en éclairage artificiel faible.</li>
  <li><strong>Montrez les détails importants</strong> : état, défauts éventuels, fonctionnement.</li>
  <li><strong>Restez court</strong> : une vidéo de quelques secondes à une minute suffit généralement.</li>
  <li><strong>Ajoutez le prix et les infos clés</strong> à l'oral ou en légende.</li>
</ul>

<h2>3. Découvrir les Stories</h2>
<p>Parcourez les Stories publiées par les vendeurs pour découvrir des produits en vidéo, ou publiez la vôtre pour donner plus de visibilité à votre annonce.</p>

<a class="cta" href="${origin}/stories">Voir les Stories →</a>
<p style="margin-top:1.4rem">Voir aussi : <a href="${origin}/blog">Tous les articles du blog</a> · <a href="${origin}/blog/reussir-annonce-photos-prix-senegal">Réussir son annonce : photos et prix</a></p>`;

  return contentResponse(renderContentPage({
    origin, path: '/blog/nexus-stories-decouvrir-publier-videos-vente',
    title: 'NEXUS Stories : découvrir et publier des vidéos de vente',
    description: 'Les Stories NEXUS Market : comment filmer une vidéo produit efficace et pourquoi ça inspire plus confiance qu\'une simple photo.',
    h1: 'NEXUS Stories : découvrir et publier des vidéos de vente', crumbName: 'Blog — Stories vidéo',
    isArticle: true, datePublished: '2026-08-19', bodyHtml: body, extraGraph: [faq],
  }));
}
