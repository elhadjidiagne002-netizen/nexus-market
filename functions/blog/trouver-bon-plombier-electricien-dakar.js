// functions/blog/trouver-bon-plombier-electricien-dakar.js
import { renderContentPage, contentResponse } from '../_lib/contentpage.js';

export async function onRequest({ request, env }) {
  const origin = env.SITE_URL || new URL(request.url).origin;
  const faq = {
    '@type': 'FAQPage',
    mainEntity: [
      { '@type': 'Question', name: 'Faut-il toujours demander un devis avant les travaux ?', acceptedAnswer: { '@type': 'Answer', text: 'Oui, systématiquement, même pour une petite intervention — un devis écrit ou au minimum un prix annoncé clairement avant de commencer évite les mauvaises surprises.' } },
      { '@type': 'Question', name: 'Comment vérifier l\'expérience d\'un artisan avant de l\'engager ?', acceptedAnswer: { '@type': 'Answer', text: 'Consultez ses années d\'expérience et, si disponibles, les avis d\'autres clients sur sa fiche professionnelle avant de le contacter.' } },
    ],
  };
  const body = `
<h1>Comment trouver un bon plombier ou électricien à Dakar : les questions à poser</h1>
<p class="lead">Une fuite à réparer, une installation électrique à revoir : trouver un artisan fiable rapidement n'est pas toujours simple. Voici les bons réflexes avant d'engager quelqu'un.</p>

<div class="tldr">
<h2>À retenir</h2>
<ul>
  <li>Demandez toujours un prix ou un devis avant que les travaux ne commencent.</li>
  <li>Vérifiez l'expérience et, si possible, les avis d'autres clients.</li>
  <li>Pour une intervention urgente, privilégiez un artisan proche de votre quartier.</li>
</ul>
</div>

<h2>1. Les questions à poser avant d'engager</h2>
<ul>
  <li><strong>Quelle est votre expérience sur ce type d'intervention ?</strong></li>
  <li><strong>Pouvez-vous me donner un prix avant de commencer ?</strong></li>
  <li><strong>Le déplacement est-il facturé séparément ?</strong></li>
  <li><strong>Intervenez-vous en urgence, et à quel tarif ?</strong></li>
</ul>

<h2>2. Petite intervention ou gros chantier : pas la même approche</h2>
<p>Pour une réparation ponctuelle (fuite, panne électrique), la proximité et la disponibilité rapide priment. Pour des travaux plus importants (rénovation complète, installation neuve), prenez le temps de comparer plusieurs devis et de vérifier l'expérience de l'artisan sur des chantiers similaires.</p>

<h2>3. Trouver un artisan près de chez vous</h2>
<p>NEXUS Pro référence des artisans et ouvriers géolocalisés au Sénégal (plombiers, électriciens, menuisiers et plus) avec leur profession, leur ville et leur expérience affichées sur chaque profil. Recherchez directement l'artisan qu'il vous faut, près de chez vous.</p>

<a class="cta" href="${origin}/?pro=1">Trouver un artisan →</a>
<p style="margin-top:1.4rem">Voir aussi : <a href="${origin}/blog">Tous les articles du blog</a> · <a href="${origin}/blog/devis-travaux-senegal-comparer-prix">Devis travaux au Sénégal : comment comparer</a></p>`;

  return contentResponse(renderContentPage({
    origin, path: '/blog/trouver-bon-plombier-electricien-dakar',
    title: 'Comment trouver un bon plombier ou électricien à Dakar',
    description: 'Trouver un artisan fiable à Dakar : les questions à poser avant d\'engager un plombier, électricien ou autre ouvrier.',
    h1: 'Comment trouver un bon plombier ou électricien à Dakar : les questions à poser', crumbName: 'Blog — Trouver un artisan',
    isArticle: true, datePublished: '2026-08-19', bodyHtml: body, extraGraph: [faq],
  }));
}
