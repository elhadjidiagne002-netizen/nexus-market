// functions/guide/troc-echanger-objets-senegal.js → /guide/troc-echanger-objets-senegal
import { renderContentPage, contentResponse } from '../_lib/contentpage.js';

export async function onRequest({ request, env }) {
  const origin = env.SITE_URL || new URL(request.url).origin;
  const faq = {
    '@type': 'FAQPage',
    mainEntity: [
      { '@type': 'Question', name: 'Le troc est-il légal et sûr au Sénégal ?', acceptedAnswer: { '@type': 'Answer', text: 'Oui, échanger des objets entre particuliers est parfaitement légal. Pour la sécurité, privilégiez un lieu public pour la remise, vérifiez l’objet avant l’échange et passez par une plateforme qui encadre les propositions.' } },
      { '@type': 'Question', name: 'Comment estimer la valeur des objets à échanger ?', acceptedAnswer: { '@type': 'Answer', text: 'Comparez chaque objet à son prix d’occasion sur le marché. Un bon troc est équilibré : si les valeurs diffèrent, on peut ajouter une petite soulte (complément en argent) pour équilibrer.' } },
    ],
  };
  const body = `
<h1>Le troc : échanger ses objets sans argent au Sénégal</h1>
<p class="lead">Et si vous échangiez ce dont vous ne vous servez plus contre ce dont vous avez besoin ? Le troc revient en force, porté par l’envie de consommer malin et durable. Avec NEXUS Troc, échangez en toute simplicité, sans sortir un franc.</p>

<h2>1. Pourquoi trocquer ?</h2>
<ul>
  <li><strong>Économique</strong> : vous obtenez un objet utile sans dépenser d’argent.</li>
  <li><strong>Écologique</strong> : on prolonge la vie des objets plutôt que de les jeter.</li>
  <li><strong>Pratique</strong> : idéal pour les objets en bon état qui dorment chez vous (électronique, vêtements, meubles, livres, outils…).</li>
</ul>

<h2>2. Comment fonctionne NEXUS Troc</h2>
<div class="box">
<p>Publiez l’objet que vous proposez et indiquez ce que vous recherchez en échange. Les autres membres vous envoient des <strong>propositions de troc</strong> ; vous comparez, discutez, puis acceptez celle qui vous convient. Vous convenez ensuite d’un lieu de remise. Simple, gratuit, sans intermédiaire financier.</p>
</div>

<h2>3. Bien évaluer un échange</h2>
<p>Un troc réussi est un troc <strong>équilibré</strong>. Estimez la valeur d’occasion de chaque objet (en comparant aux annonces similaires). Si les valeurs ne sont pas tout à fait égales, proposez une petite <em>soulte</em> (un complément en argent) pour équilibrer. Soyez honnête sur l’état réel de votre objet : photos nettes et description fidèle évitent les déceptions.</p>

<h2>4. Échanger en toute sécurité</h2>
<ul>
  <li><strong>Rencontrez-vous dans un lieu public</strong> et fréquenté pour la remise.</li>
  <li><strong>Inspectez l’objet</strong> avant de finaliser : état, fonctionnement, accessoires.</li>
  <li><strong>Méfiez-vous</strong> des propositions trop belles ou des personnes pressées qui refusent toute vérification.</li>
  <li><strong>Gardez une trace</strong> de la conversation et de l’accord.</li>
</ul>

<h2>5. Quels objets s’échangent le mieux ?</h2>
<p>Tout ce qui est utile et en bon état : téléphones et accessoires, électroménager, vêtements et chaussures, meubles, livres et manuels scolaires, jouets, outils de bricolage, articles de sport. Un objet propre, complet et bien présenté trouve preneur beaucoup plus vite.</p>

<a class="cta gold" href="${origin}/">Découvrir NEXUS Troc →</a>
<p style="margin-top:1.4rem">Voir aussi : <a href="${origin}/guide/acheter-en-ligne-au-senegal">Acheter sans se faire arnaquer</a> · <a href="${origin}/guides">Tous les guides</a></p>`;

  return contentResponse(renderContentPage({
    origin, path: '/guide/troc-echanger-objets-senegal',
    title: 'Le troc au Sénégal : échanger ses objets sans argent — guide',
    description: 'Comment trocquer au Sénégal avec NEXUS Troc : principe, évaluation d’un échange équilibré, sécurité de la remise et objets qui s’échangent le mieux.',
    h1: 'Le troc : échanger ses objets', crumbName: 'Guide — Troc',
    isArticle: true, bodyHtml: body, extraGraph: [faq],
  }));
}
