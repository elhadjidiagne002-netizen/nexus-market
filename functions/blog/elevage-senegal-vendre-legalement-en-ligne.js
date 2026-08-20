// functions/blog/elevage-senegal-vendre-legalement-en-ligne.js
import { renderContentPage, contentResponse } from '../_lib/contentpage.js';

export async function onRequest({ request, env }) {
  const origin = env.SITE_URL || new URL(request.url).origin;
  const faq = {
    '@type': 'FAQPage',
    mainEntity: [
      { '@type': 'Question', name: 'Faut-il un statut particulier pour vendre ses animaux en ligne ?', acceptedAnswer: { '@type': 'Answer', text: 'Pour une vente occasionnelle (quelques animaux d\'un élevage familial), aucun statut commercial n\'est requis. Pour une activité régulière et à plus grande échelle, mieux vaut se renseigner sur les démarches d\'enregistrement auprès des autorités compétentes.' } },
      { '@type': 'Question', name: 'Comment fixer un prix juste pour ses animaux ?', acceptedAnswer: { '@type': 'Answer', text: 'Comparez les prix pratiqués pour des animaux similaires (âge, poids, race) sur les annonces déjà publiées avant de fixer le vôtre.' } },
    ],
  };
  const body = `
<h1>Élevage au Sénégal : démarches pour vendre légalement ses animaux en ligne</h1>
<p class="lead">De plus en plus d'éleveurs, petits ou grands, publient leurs annonces en ligne pour toucher plus d'acheteurs. Voici les bons réflexes pour vendre dans de bonnes conditions.</p>

<div class="tldr">
<h2>À retenir</h2>
<ul>
  <li>Une vente occasionnelle depuis un élevage familial ne nécessite pas de statut commercial particulier.</li>
  <li>Photographiez vos animaux clairement et indiquez l'âge, le poids et la race dans votre annonce.</li>
  <li>Comparez les prix du marché avant de fixer le vôtre.</li>
</ul>
</div>

<h2>1. Ce qu'il faut préciser dans une annonce</h2>
<ul>
  <li><strong>L'âge et le poids approximatif</strong> de l'animal.</li>
  <li><strong>La race</strong>, un critère important pour de nombreux acheteurs.</li>
  <li><strong>L'état de santé général</strong> et les conditions d'élevage.</li>
  <li><strong>Des photos récentes et claires</strong> — un critère qui influence fortement la confiance des acheteurs.</li>
</ul>

<h2>2. Fixer un prix juste</h2>
<p>Comparez les annonces déjà publiées pour des animaux similaires (âge, poids, race, période de l'année) avant de fixer votre prix. Les prix varient fortement à l'approche de certaines fêtes comme la Tabaski.</p>

<h2>3. Publier votre annonce</h2>
<p>NEXUS Market propose un espace dédié pour devenir éleveur référencé et publier vos annonces d'animaux, avec vos coordonnées directes visibles par les acheteurs intéressés.</p>

<a class="cta" href="${origin}/devenir-eleveur">Devenir éleveur référencé →</a>
<p style="margin-top:1.4rem">Voir aussi : <a href="${origin}/blog">Tous les articles du blog</a> · <a href="${origin}/blog/choisir-mouton-tabaski-criteres-prix">Bien choisir son mouton de Tabaski</a> · <a href="${origin}/blog/bien-nourrir-loger-animaux-elevage-quotidien">Bien nourrir et loger ses animaux au quotidien</a></p>`;

  return contentResponse(renderContentPage({
    origin, path: '/blog/elevage-senegal-vendre-legalement-en-ligne',
    title: 'Élevage au Sénégal : démarches pour vendre légalement ses animaux en ligne',
    description: 'Vendre ses animaux d\'élevage en ligne au Sénégal : ce qu\'il faut préciser dans une annonce et comment fixer un prix juste.',
    h1: 'Élevage au Sénégal : démarches pour vendre légalement ses animaux en ligne', crumbName: 'Blog — Vendre ses animaux',
    isArticle: true, datePublished: '2026-08-19', bodyHtml: body, extraGraph: [faq],
  }));
}
