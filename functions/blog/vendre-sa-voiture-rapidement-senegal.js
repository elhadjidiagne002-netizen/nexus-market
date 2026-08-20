// functions/blog/vendre-sa-voiture-rapidement-senegal.js
import { renderContentPage, contentResponse } from '../_lib/contentpage.js';

export async function onRequest({ request, env }) {
  const origin = env.SITE_URL || new URL(request.url).origin;
  const faq = {
    '@type': 'FAQPage',
    mainEntity: [
      { '@type': 'Question', name: 'Faut-il faire réviser sa voiture avant de la vendre ?', acceptedAnswer: { '@type': 'Answer', text: 'Une petite révision (niveaux, pneus, propreté générale) rassure les acheteurs et peut justifier un meilleur prix, sans nécessiter un investissement important.' } },
      { '@type': 'Question', name: 'Combien de photos faut-il pour une annonce de voiture ?', acceptedAnswer: { '@type': 'Answer', text: 'Au moins 6 à 8 photos sous différents angles (extérieur, intérieur, compteur, moteur) donnent une bien meilleure impression de sérieux qu\'une seule photo.' } },
    ],
  };
  const body = `
<h1>Vendre sa voiture rapidement au Sénégal : conseils pratiques</h1>
<p class="lead">Un bon prix et une annonce bien faite font toute la différence pour vendre rapidement. Voici les réflexes qui accélèrent vraiment la vente.</p>

<div class="tldr">
<h2>À retenir</h2>
<ul>
  <li>Une voiture propre et bien photographiée se vend plus vite et souvent plus cher.</li>
  <li>Fixez un prix réaliste en comparant les annonces de véhicules similaires.</li>
  <li>Préparez les documents du véhicule à l'avance pour ne pas ralentir la transaction.</li>
</ul>
</div>

<h2>1. Préparer le véhicule avant de le photographier</h2>
<p>Un nettoyage complet, intérieur comme extérieur, change beaucoup l'impression laissée par les photos. Une petite révision (niveaux, pression des pneus) rassure aussi les acheteurs sur l'entretien général du véhicule.</p>

<h2>2. Bien photographier son annonce</h2>
<ul>
  <li>Extérieur sous plusieurs angles, en pleine lumière naturelle.</li>
  <li>Intérieur : sièges, tableau de bord, compteur kilométrique.</li>
  <li>Moteur, pour rassurer sur l'entretien.</li>
  <li>Tout défaut visible : mieux vaut le montrer que le cacher, ça évite les négociations de dernière minute.</li>
</ul>

<h2>3. Fixer le bon prix</h2>
<p>Comparez plusieurs annonces de véhicules similaires (modèle, année, kilométrage) avant de fixer votre prix — voir notre guide <a href="${origin}/blog/comment-fixer-prix-revente-objet-occasion">comment fixer le juste prix d'un objet d'occasion</a> pour la méthode complète.</p>

<h2>4. Publier son annonce</h2>
<p>NEXUS Market référence des annonces de véhicules dans la <a href="${origin}/categorie/auto">catégorie Auto &amp; Moto</a>, consultées par des acheteurs actifs dans plusieurs villes du Sénégal.</p>

<a class="cta" href="${origin}/categorie/auto">Publier mon annonce →</a>
<p style="margin-top:1.4rem">Voir aussi : <a href="${origin}/blog">Tous les articles du blog</a> · <a href="${origin}/blog/reussir-annonce-photos-prix-senegal">Réussir son annonce : photos et prix</a></p>`;

  return contentResponse(renderContentPage({
    origin, path: '/blog/vendre-sa-voiture-rapidement-senegal',
    title: 'Vendre sa voiture rapidement au Sénégal : conseils pratiques',
    description: 'Comment préparer, photographier et fixer le prix de son véhicule pour le vendre rapidement au Sénégal.',
    h1: 'Vendre sa voiture rapidement au Sénégal : conseils pratiques', crumbName: 'Blog — Vendre sa voiture',
    isArticle: true, datePublished: '2026-08-19', bodyHtml: body, extraGraph: [faq],
  }));
}
