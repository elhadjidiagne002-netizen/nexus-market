// functions/blog/location-voiture-senegal-agences-prix.js
import { renderContentPage, contentResponse } from '../_lib/contentpage.js';

export async function onRequest({ request, env }) {
  const origin = env.SITE_URL || new URL(request.url).origin;
  const faq = {
    '@type': 'FAQPage',
    mainEntity: [
      { '@type': 'Question', name: 'Faut-il un permis international pour louer une voiture au Sénégal ?', acceptedAnswer: { '@type': 'Answer', text: 'Pour un résident sénégalais, le permis national suffit. Pour un visiteur étranger, la plupart des agences demandent un permis international ou une traduction officielle, en plus du permis d\'origine.' } },
      { '@type': 'Question', name: 'Le carburant est-il inclus dans le prix de location ?', acceptedAnswer: { '@type': 'Answer', text: 'Non, presque jamais. Le véhicule est généralement rendu avec le même niveau de carburant qu\'au départ — vérifiez cette clause avant de signer.' } },
      { '@type': 'Question', name: 'Quelle caution prévoir pour une location de voiture ?', acceptedAnswer: { '@type': 'Answer', text: 'La caution (dépôt de garantie) varie selon le véhicule et l\'agence, souvent bloquée sur une carte bancaire ou versée en espèces, et restituée à la remise du véhicule en bon état.' } },
    ],
  };
  const body = `
<h1>Location de voiture au Sénégal : agences, prix et conseils</h1>
<p class="lead">Pour un déplacement professionnel, des vacances en famille ou simplement en attendant l'achat d'un véhicule, louer une voiture au Sénégal est une solution flexible. Voici comment bien choisir.</p>

<div class="tldr">
<h2>À retenir</h2>
<ul>
  <li>Le prix dépend du modèle, de la durée et du kilométrage inclus — demandez toujours un devis détaillé.</li>
  <li>Vérifiez systématiquement l'état du véhicule et l'assurance incluse avant de partir.</li>
  <li>Pour un trajet longue distance, certaines agences proposent un service avec chauffeur (VTC).</li>
</ul>
</div>

<h2>1. Location avec ou sans chauffeur ?</h2>
<p>Deux formules coexistent au Sénégal : la location "sèche" (vous conduisez vous-même) et la location avec chauffeur, proche du VTC — pratique pour un trajet longue distance ou si vous ne connaissez pas bien les routes régionales. La seconde est en général plus chère mais évite les contraintes de conduite sur de longs trajets (Dakar-Ziguinchor, Dakar-Tambacounda…).</p>

<h2>2. Ce qui influence le prix</h2>
<table>
<thead><tr><th>Facteur</th><th>Impact</th></tr></thead>
<tbody>
<tr><td>Type de véhicule (citadine, 4x4, utilitaire)</td><td>Écart important selon la catégorie</td></tr>
<tr><td>Durée de location</td><td>Tarif dégressif sur la semaine ou le mois</td></tr>
<tr><td>Kilométrage inclus</td><td>Un forfait dépassé peut coûter cher au retour</td></tr>
<tr><td>Avec ou sans chauffeur</td><td>Le chauffeur majore le tarif mais évite la fatigue de conduite</td></tr>
</tbody>
</table>

<h2>3. Points à vérifier avant de prendre le volant</h2>
<ul>
  <li><strong>État du véhicule</strong> : faites le tour avec l'agent, notez toute rayure ou dommage existant.</li>
  <li><strong>Assurance</strong> : demandez précisément ce qui est couvert (dommages, vol, tiers) et ce qui reste à votre charge.</li>
  <li><strong>Documents du véhicule</strong> : carte grise, assurance en cours de validité, vignette à jour.</li>
  <li><strong>Assistance en cas de panne</strong> : un numéro d'urgence doit être fourni par l'agence.</li>
</ul>

<h2>4. Où trouver une agence fiable</h2>
<p>NEXUS Market référence des agences de location de voitures et de VTC dans plusieurs villes du pays, avec leurs coordonnées directes. Consultez la <a href="${origin}/categorie/auto">catégorie Auto & Moto</a> pour comparer les options disponibles près de chez vous, ou notre guide pour <a href="${origin}/blog/bien-choisir-voiture-occasion-senegal">bien choisir une voiture d'occasion</a> si vous envisagez plutôt l'achat.</p>

<a class="cta" href="${origin}/categorie/auto">Voir les voitures à louer →</a>
<p style="margin-top:1.4rem">Voir aussi : <a href="${origin}/blog">Tous les articles du blog</a> · <a href="${origin}/covoiturage">Covoiturage & lignes de transport</a></p>`;

  return contentResponse(renderContentPage({
    origin, path: '/blog/location-voiture-senegal-agences-prix',
    title: 'Location de voiture au Sénégal : agences, prix et conseils',
    description: 'Louer une voiture au Sénégal : avec ou sans chauffeur, ce qui influence le prix, les points à vérifier avant de partir et où trouver une agence fiable.',
    h1: 'Location de voiture au Sénégal : agences, prix et conseils', crumbName: 'Blog — Location de voiture',
    isArticle: true, datePublished: '2026-08-19', bodyHtml: body, extraGraph: [faq],
  }));
}
