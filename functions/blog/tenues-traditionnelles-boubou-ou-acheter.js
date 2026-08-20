// functions/blog/tenues-traditionnelles-boubou-ou-acheter.js
import { renderContentPage, contentResponse } from '../_lib/contentpage.js';

export async function onRequest({ request, env }) {
  const origin = env.SITE_URL || new URL(request.url).origin;
  const faq = {
    '@type': 'FAQPage',
    mainEntity: [
      { '@type': 'Question', name: 'Boubou sur-mesure ou prêt-à-porter : lequel choisir ?', acceptedAnswer: { '@type': 'Answer', text: 'Le sur-mesure offre une coupe parfaitement adaptée mais demande plus de délai et un budget plus élevé ; le prêt-à-porter convient pour un besoin rapide ou un budget plus serré.' } },
      { '@type': 'Question', name: 'Quel tissu privilégier pour une tenue de fête ?', acceptedAnswer: { '@type': 'Answer', text: 'Le wax reste le plus populaire pour sa résistance et ses couleurs, mais le bazin est très prisé pour les tenues de fête plus formelles.' } },
    ],
  };
  const body = `
<h1>Tenues traditionnelles : où acheter boubou et tissus pour une fête</h1>
<p class="lead">Boubou, bazin, wax : pour une fête (Korité, mariage, baptême), la tenue traditionnelle occupe une place centrale. Voici comment bien choisir son tissu et sa coupe.</p>

<div class="tldr">
<h2>À retenir</h2>
<ul>
  <li>Le wax est résistant et coloré, le bazin plus formel — le choix dépend de l'occasion.</li>
  <li>Le sur-mesure offre une meilleure coupe mais demande plus de délai qu'un achat prêt-à-porter.</li>
  <li>Anticipez votre achat avant les périodes de forte demande (Korité, mariages) pour de meilleurs prix.</li>
</ul>
</div>

<h2>1. Choisir son tissu</h2>
<table>
<thead><tr><th>Tissu</th><th>Caractéristiques</th></tr></thead>
<tbody>
<tr><td>Wax</td><td>Résistant, coloré, polyvalent pour le quotidien comme les fêtes</td></tr>
<tr><td>Bazin</td><td>Plus formel, souvent réservé aux grandes occasions</td></tr>
<tr><td>Tissus brodés</td><td>Pour des tenues de cérémonie haut de gamme</td></tr>
</tbody>
</table>

<h2>2. Sur-mesure ou prêt-à-porter</h2>
<p>Le sur-mesure garantit une coupe parfaitement ajustée, mais nécessite de prendre rendez-vous avec un couturier suffisamment à l'avance, surtout en période de forte demande. Le prêt-à-porter reste une option rapide pour un besoin urgent ou un budget plus limité.</p>

<h2>3. Bien entretenir sa tenue après achat</h2>
<p>Pour préserver les couleurs et la qualité de votre tissu, voir notre guide <a href="${origin}/blog/entretenir-vetements-wax-conseils">entretenir ses vêtements en wax</a>.</p>

<h2>4. Trouver tissus et couturiers</h2>
<p>NEXUS Market référence des tissus, tenues et couturiers dans la <a href="${origin}/categorie/mode">catégorie Mode &amp; Vêtements</a>, avec photos et prix affichés.</p>

<a class="cta" href="${origin}/categorie/mode">Voir les tissus et tenues →</a>
<p style="margin-top:1.4rem">Voir aussi : <a href="${origin}/blog">Tous les articles du blog</a> · <a href="${origin}/blog/korite-tenues-cadeaux-preparatifs">Korité : tenues, cadeaux et préparatifs</a></p>`;

  return contentResponse(renderContentPage({
    origin, path: '/blog/tenues-traditionnelles-boubou-ou-acheter',
    title: 'Tenues traditionnelles : où acheter boubou et tissus pour une fête',
    description: 'Boubou, wax, bazin : comment bien choisir son tissu et sa coupe pour une tenue traditionnelle de fête au Sénégal.',
    h1: 'Tenues traditionnelles : où acheter boubou et tissus pour une fête', crumbName: 'Blog — Tenues traditionnelles',
    isArticle: true, datePublished: '2026-08-19', bodyHtml: body, extraGraph: [faq],
  }));
}
