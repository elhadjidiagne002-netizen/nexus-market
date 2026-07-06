// functions/blog/entretenir-vetements-wax-conseils.js
import { renderContentPage, contentResponse } from '../_lib/contentpage.js';

export async function onRequest({ request, env }) {
  const origin = env.SITE_URL || new URL(request.url).origin;
  const faq = {
    '@type': 'FAQPage',
    mainEntity: [
      { '@type': 'Question', name: 'Peut-on laver le wax en machine ?', acceptedAnswer: { '@type': 'Answer', text: 'Oui, à l\'eau froide ou tiède et à faible essorage, en retournant le tissu sur l\'envers pour préserver les couleurs le plus longtemps possible.' } },
      { '@type': 'Question', name: 'Comment repasser un tissu wax sans l\'abîmer ?', acceptedAnswer: { '@type': 'Answer', text: 'Repassez toujours sur l\'envers du tissu, à température modérée, pour éviter de ternir les couleurs et les motifs imprimés.' } },
    ],
  };
  const body = `
<h1>Entretenir ses vêtements en wax : conseils pratiques</h1>
<p class="lead">Le wax est un tissu apprécié pour ses couleurs vives et ses motifs, mais il demande un entretien adapté pour garder tout son éclat au fil des lavages. Voici les bons réflexes.</p>

<div class="tldr">
<h2>À retenir</h2>
<ul>
  <li>Lavez toujours le wax à l'envers, à l'eau froide ou tiède.</li>
  <li>Évitez le sèche-linge : préférez un séchage à l'ombre.</li>
  <li>Repassez sur l'envers pour préserver les couleurs et les motifs.</li>
</ul>
</div>

<h2>1. Le lavage : à l'envers et en douceur</h2>
<p>Retournez toujours le vêtement avant de le laver, à la main ou en machine à faible essorage et à l'eau froide ou tiède. Cette précaution limite le frottement direct sur les motifs imprimés et prolonge nettement la durée de vie des couleurs.</p>

<h2>2. Éviter les produits agressifs</h2>
<p>Privilégiez une lessive douce, sans javel ni détachant puissant, qui pourrait ternir ou décolorer le tissu. Pour les taches tenaces, un traitement local avant lavage est préférable à un produit fort sur l'ensemble du vêtement.</p>

<h2>3. Le séchage : à l'ombre, jamais en machine</h2>
<p>Le sèche-linge use prématurément les fibres et peut altérer les couleurs du wax. Un séchage à l'air libre, à l'ombre plutôt qu'en plein soleil, protège à la fois le tissu et l'intensité des teintes.</p>

<h2>4. Le repassage sur l'envers</h2>
<p>Repassez toujours le vêtement sur l'envers, à température modérée. Repasser directement sur l'endroit du tissu, à haute température, est l'une des causes les plus fréquentes de ternissement prématuré du wax.</p>

<h2>5. Le rangement entre deux utilisations</h2>
<p>Rangez vos pièces en wax pliées plutôt que sur cintre pour les tissus lourds, à l'abri de la lumière directe et de l'humidité, qui peuvent altérer les couleurs sur le long terme.</p>

<div class="box">
<p>Vous vendez du wax ou des créations sur mesure ? Ces conseils d'entretien sont un excellent argument à partager avec vos acheteurs — voir notre guide <a href="${origin}/guide/vendre-artisanat-mode-senegal">vendre son artisanat et sa mode africaine</a>.</p>
</div>

<a class="cta" href="${origin}/categorie/mode">Découvrir la catégorie Mode →</a>
<p style="margin-top:1.4rem">Voir aussi : <a href="${origin}/blog">Tous les articles du blog</a> · <a href="${origin}/guides">Tous les guides</a></p>`;

  return contentResponse(renderContentPage({
    origin, path: '/blog/entretenir-vetements-wax-conseils',
    title: 'Entretenir ses vêtements en wax : conseils pratiques',
    description: 'Comment laver, sécher et repasser ses vêtements en wax pour préserver leurs couleurs et motifs au fil des lavages.',
    h1: 'Entretenir ses vêtements en wax : conseils pratiques', crumbName: 'Blog — Entretien du wax',
    isArticle: true, datePublished: '2026-07-06', bodyHtml: body, extraGraph: [faq],
  }));
}
