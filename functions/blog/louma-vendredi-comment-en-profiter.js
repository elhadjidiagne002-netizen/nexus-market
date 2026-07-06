// functions/blog/louma-vendredi-comment-en-profiter.js
import { renderContentPage, contentResponse } from '../_lib/contentpage.js';

export async function onRequest({ request, env }) {
  const origin = env.SITE_URL || new URL(request.url).origin;
  const faq = {
    '@type': 'FAQPage',
    mainEntity: [
      { '@type': 'Question', name: 'À quelle heure le Louma NEXUS s\'active-t-il ?', acceptedAnswer: { '@type': 'Answer', text: 'L\'édition Louma est active toute la journée du vendredi ; les meilleures offres partent généralement en premier, mieux vaut consulter tôt dans la journée.' } },
      { '@type': 'Question', name: 'Puis-je négocier un prix affiché pendant le Louma ?', acceptedAnswer: { '@type': 'Answer', text: 'Oui, comme pour toute annonce sur NEXUS Market, vous pouvez contacter le vendeur pour négocier, même pendant l\'édition Louma.' } },
    ],
  };
  const body = `
<h1>Louma du vendredi : comment en profiter au maximum</h1>
<p class="lead">Chaque vendredi, le Louma NEXUS met en avant une sélection de vendeurs et d'offres à l'image des marchés traditionnels sénégalais. Voici comment ne rien rater des meilleures affaires.</p>

<div class="tldr">
<h2>À retenir</h2>
<ul>
  <li>Consultez le Louma tôt le vendredi : les meilleures offres partent vite.</li>
  <li>Comparez toujours le prix Louma au prix habituel du produit avant d'acheter.</li>
  <li>Les vendeurs peuvent aussi bénéficier d'une meilleure visibilité ce jour-là.</li>
</ul>
</div>

<h2>1. Pourquoi le vendredi ?</h2>
<p>Au Sénégal, le « louma » désigne traditionnellement un grand marché périodique organisé un jour fixe dans une localité, où producteurs et commerçants se retrouvent pour échanger. NEXUS reprend cet esprit de rendez-vous régulier en dédiant chaque vendredi à une édition spéciale de la marketplace, avec une sélection de vendeurs mise en avant.</p>

<h2>2. Comment repérer les bonnes affaires</h2>
<ul>
  <li>Ouvrez l'application dès le début de journée le vendredi : les offres les plus attractives partent en premier.</li>
  <li>Comparez toujours le prix affiché pendant le Louma au prix habituel de la fiche produit — l'écart doit être réel.</li>
  <li>Activez les notifications NEXUS pour être alerté des nouvelles offres du jour.</li>
</ul>

<h2>3. Le Louma, une opportunité aussi pour les vendeurs</h2>
<p>Si vous vendez sur NEXUS Market, l'édition Louma peut mettre vos produits davantage en avant ce jour-là. C'est l'occasion d'ajuster ponctuellement vos prix ou de mettre en avant un article qui peine à se vendre le reste de la semaine — voir notre guide <a href="${origin}/guide/vendre-sur-nexus-market">vendre sur NEXUS Market</a> pour optimiser vos annonces au quotidien.</p>

<h2>4. Ce n'est pas réservé à un jour</h2>
<p>En dehors du vendredi, le catalogue complet de NEXUS Market reste bien sûr disponible avec ses prix habituels — le Louma est un complément, pas un remplacement de la marketplace classique.</p>

<a class="cta" href="${origin}/louma">Découvrir le Louma NEXUS →</a>
<p style="margin-top:1.4rem">Voir aussi : <a href="${origin}/blog">Tous les articles du blog</a> · <a href="${origin}/guides">Tous les guides</a></p>`;

  return contentResponse(renderContentPage({
    origin, path: '/blog/louma-vendredi-comment-en-profiter',
    title: 'Louma du vendredi : comment en profiter au maximum',
    description: 'Nos astuces pour profiter au mieux du Louma NEXUS, l\'édition hebdomadaire du vendredi de la marketplace sénégalaise.',
    h1: 'Louma du vendredi : comment en profiter au maximum', crumbName: 'Blog — Louma',
    isArticle: true, datePublished: '2026-07-06', bodyHtml: body, extraGraph: [faq],
  }));
}
