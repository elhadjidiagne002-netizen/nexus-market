// functions/blog/louer-food-truck-evenement-senegal.js
import { renderContentPage, contentResponse } from '../_lib/contentpage.js';

export async function onRequest({ request, env }) {
  const origin = env.SITE_URL || new URL(request.url).origin;
  const faq = {
    '@type': 'FAQPage',
    mainEntity: [
      { '@type': 'Question', name: 'Le food truck fournit-il la nourriture ou juste l\'espace ?', acceptedAnswer: { '@type': 'Answer', text: 'Cela dépend de la formule : certains prestataires proposent un service complet (nourriture + équipe), d\'autres louent uniquement le véhicule équipé pour votre propre traiteur.' } },
      { '@type': 'Question', name: 'Quel espace prévoir pour l\'installation d\'un food truck ?', acceptedAnswer: { '@type': 'Answer', text: 'Prévoyez un accès véhicule dégagé et un espace plat suffisant pour le stationnement et la file d\'attente — à confirmer avec le prestataire selon le modèle du véhicule.' } },
    ],
  };
  const body = `
<h1>Louer un food truck pour un événement au Sénégal : mode d'emploi</h1>
<p class="lead">Mariage, anniversaire d'entreprise, événement associatif : le food truck est une option de restauration de plus en plus demandée. Voici comment bien organiser cette prestation.</p>

<div class="tldr">
<h2>À retenir</h2>
<ul>
  <li>Vérifiez si la formule inclut la nourriture et le personnel, ou uniquement la location du véhicule.</li>
  <li>Prévoyez un espace dégagé et accessible pour l'installation.</li>
  <li>Réservez à l'avance, surtout pour un événement en week-end.</li>
</ul>
</div>

<h2>1. Les formules possibles</h2>
<p>Deux approches coexistent : la location "clé en main" (le prestataire gère la nourriture et le service), ou la location du véhicule seul si vous avez déjà votre propre traiteur. La première est plus simple à organiser, la seconde offre plus de liberté sur le menu.</p>

<h2>2. Ce qu'il faut vérifier avant de réserver</h2>
<ul>
  <li><strong>Menu et quantités</strong> : adaptez la commande au nombre d'invités attendus.</li>
  <li><strong>Accès et installation</strong> : le lieu doit permettre le stationnement du véhicule.</li>
  <li><strong>Durée de la prestation</strong> : horaires de service inclus dans le devis.</li>
  <li><strong>Électricité/eau</strong> : certains food trucks nécessitent un branchement sur place.</li>
</ul>

<h2>3. Trouver un prestataire</h2>
<p>NEXUS Market référence des prestataires de food truck et de matériel événementiel dans plusieurs villes du Sénégal. Consultez la <a href="${origin}/categorie/services">catégorie Services</a> pour comparer les options disponibles pour votre événement.</p>

<a class="cta" href="${origin}/categorie/services">Voir les prestataires disponibles →</a>
<p style="margin-top:1.4rem">Voir aussi : <a href="${origin}/blog">Tous les articles du blog</a> · <a href="${origin}/blog/anniversaire-enfant-dakar-materiel">Organiser un anniversaire d'enfant à Dakar</a></p>`;

  return contentResponse(renderContentPage({
    origin, path: '/blog/louer-food-truck-evenement-senegal',
    title: 'Louer un food truck pour un événement au Sénégal : mode d\'emploi',
    description: 'Location de food truck au Sénégal pour un mariage, anniversaire ou événement d\'entreprise : formules, prix et points à vérifier.',
    h1: 'Louer un food truck pour un événement au Sénégal : mode d\'emploi', crumbName: 'Blog — Food truck événementiel',
    isArticle: true, datePublished: '2026-08-19', bodyHtml: body, extraGraph: [faq],
  }));
}
