// functions/blog/anniversaire-enfant-dakar-materiel.js
import { renderContentPage, contentResponse } from '../_lib/contentpage.js';

export async function onRequest({ request, env }) {
  const origin = env.SITE_URL || new URL(request.url).origin;
  const faq = {
    '@type': 'FAQPage',
    mainEntity: [
      { '@type': 'Question', name: 'Combien de temps à l\'avance réserver le matériel d\'animation ?', acceptedAnswer: { '@type': 'Answer', text: 'Au moins une à deux semaines à l\'avance, surtout le week-end où la demande est plus forte — les créneaux populaires (château gonflable, animateurs) se réservent vite.' } },
      { '@type': 'Question', name: 'Le montage du matériel est-il inclus dans le prix de location ?', acceptedAnswer: { '@type': 'Answer', text: 'Cela dépend du prestataire — certains incluent la livraison et le montage, d\'autres le facturent séparément. Vérifiez avant de réserver.' } },
    ],
  };
  const body = `
<h1>Organiser un anniversaire d'enfant à Dakar : matériel et prestataires</h1>
<p class="lead">Château gonflable, animateur, décoration : organiser un anniversaire d'enfant réussi demande un peu d'anticipation. Voici comment bien planifier et où trouver le matériel.</p>

<div class="tldr">
<h2>À retenir</h2>
<ul>
  <li>Réservez le matériel populaire (château gonflable) au moins une à deux semaines à l'avance.</li>
  <li>Vérifiez si la livraison et le montage sont inclus dans le prix.</li>
  <li>Adaptez le nombre d'invités à l'espace disponible avant de choisir le matériel.</li>
</ul>
</div>

<h2>1. Le matériel essentiel</h2>
<table>
<thead><tr><th>Élément</th><th>Points à vérifier</th></tr></thead>
<tbody>
<tr><td>Château gonflable</td><td>Taille adaptée à l'espace, âge des enfants, surveillance incluse ou non</td></tr>
<tr><td>Animation (magicien, clown, jeux)</td><td>Durée de la prestation, âge du public visé</td></tr>
<tr><td>Décoration &amp; vaisselle</td><td>Thème, nombre de convives</td></tr>
<tr><td>Sonorisation</td><td>Utile pour la musique et les annonces (jeux, gâteau)</td></tr>
</tbody>
</table>

<h2>2. Bien planifier son budget</h2>
<p>Le coût varie fortement selon le nombre d'invités et le niveau de prestation souhaité. Comparez plusieurs prestataires avant de réserver, et vérifiez toujours ce qui est inclus (livraison, montage, démontage) pour éviter les frais surprises le jour J.</p>

<h2>3. Trouver du matériel et des prestataires</h2>
<p>NEXUS Market référence du matériel d'animation pour enfants (châteaux gonflables, décoration) ainsi que d'autres prestations événementielles dans plusieurs villes du Sénégal. Consultez la <a href="${origin}/categorie/sport">catégorie Sport &amp; Loisirs</a> pour comparer les options disponibles près de chez vous.</p>

<a class="cta" href="${origin}/categorie/sport">Voir le matériel disponible →</a>
<p style="margin-top:1.4rem">Voir aussi : <a href="${origin}/blog">Tous les articles du blog</a> · <a href="${origin}/blog/organiser-evenement-mariage-bapteme-materiel-loue">Organiser un mariage ou un baptême avec du matériel loué</a></p>`;

  return contentResponse(renderContentPage({
    origin, path: '/blog/anniversaire-enfant-dakar-materiel',
    title: 'Organiser un anniversaire d\'enfant à Dakar : matériel et prestataires',
    description: 'Château gonflable, animation, décoration : comment bien organiser et budgétiser un anniversaire d\'enfant à Dakar.',
    h1: 'Organiser un anniversaire d\'enfant à Dakar : matériel et prestataires', crumbName: 'Blog — Animation enfants',
    isArticle: true, datePublished: '2026-08-19', bodyHtml: body, extraGraph: [faq],
  }));
}
