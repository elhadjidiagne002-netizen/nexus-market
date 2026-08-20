// functions/blog/pieces-detachees-auto-senegal-neuf-occasion.js
import { renderContentPage, contentResponse } from '../_lib/contentpage.js';

export async function onRequest({ request, env }) {
  const origin = env.SITE_URL || new URL(request.url).origin;
  const faq = {
    '@type': 'FAQPage',
    mainEntity: [
      { '@type': 'Question', name: 'Une pièce d\'occasion est-elle fiable pour une réparation auto ?', acceptedAnswer: { '@type': 'Answer', text: 'Pour certaines pièces (carrosserie, éléments mécaniques robustes), oui, à condition de vérifier l\'état général. Pour les pièces liées à la sécurité (freins, direction), le neuf reste plus prudent.' } },
      { '@type': 'Question', name: 'Comment vérifier la compatibilité d\'une pièce avant achat ?', acceptedAnswer: { '@type': 'Answer', text: 'Comparez toujours la référence exacte de la pièce avec celle indiquée dans le carnet du véhicule ou fournie par un garagiste, plutôt que de vous fier uniquement au modèle du véhicule.' } },
    ],
  };
  const body = `
<h1>Pièces détachées auto au Sénégal : neuves vs occasion</h1>
<p class="lead">Pour une réparation, choisir entre pièce neuve et pièce d'occasion dépend du type de pièce et de votre budget. Voici comment faire le bon choix.</p>

<div class="tldr">
<h2>À retenir</h2>
<ul>
  <li>Pour les pièces de sécurité (freins, direction), privilégiez toujours le neuf.</li>
  <li>Pour la carrosserie ou certains éléments mécaniques robustes, l'occasion peut être un choix économique judicieux.</li>
  <li>Vérifiez toujours la référence exacte de la pièce, pas seulement le modèle du véhicule.</li>
</ul>
</div>

<h2>1. Neuf ou occasion selon le type de pièce</h2>
<table>
<thead><tr><th>Type de pièce</th><th>Recommandation</th></tr></thead>
<tbody>
<tr><td>Freins, direction, sécurité</td><td>Neuf recommandé</td></tr>
<tr><td>Carrosserie (rétroviseur, pare-chocs)</td><td>Occasion souvent adaptée</td></tr>
<tr><td>Moteur, transmission</td><td>À évaluer au cas par cas selon l'état et l'historique</td></tr>
</tbody>
</table>

<h2>2. Vérifier la compatibilité avant d'acheter</h2>
<p>Comparez toujours la référence exacte de la pièce avec celle indiquée par votre carnet d'entretien ou un garagiste de confiance — le modèle du véhicule seul ne suffit pas toujours à garantir la compatibilité, surtout pour des véhicules avec plusieurs variantes.</p>

<h2>3. Trouver des pièces au Sénégal</h2>
<p>NEXUS Market référence des pièces détachées auto neuves et d'occasion dans la <a href="${origin}/categorie/auto">catégorie Auto &amp; Moto</a>, avec description et photos pour chaque annonce.</p>

<a class="cta" href="${origin}/categorie/auto">Voir les pièces disponibles →</a>
<p style="margin-top:1.4rem">Voir aussi : <a href="${origin}/blog">Tous les articles du blog</a> · <a href="${origin}/blog/bien-choisir-voiture-occasion-senegal">Bien choisir sa voiture d'occasion</a></p>`;

  return contentResponse(renderContentPage({
    origin, path: '/blog/pieces-detachees-auto-senegal-neuf-occasion',
    title: 'Pièces détachées auto au Sénégal : neuves vs occasion',
    description: 'Choisir entre pièce détachée auto neuve et d\'occasion au Sénégal selon le type de réparation.',
    h1: 'Pièces détachées auto au Sénégal : neuves vs occasion', crumbName: 'Blog — Pièces détachées auto',
    isArticle: true, datePublished: '2026-08-19', bodyHtml: body, extraGraph: [faq],
  }));
}
