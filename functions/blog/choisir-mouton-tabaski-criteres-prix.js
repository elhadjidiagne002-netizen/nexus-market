// functions/blog/choisir-mouton-tabaski-criteres-prix.js
import { renderContentPage, contentResponse } from '../_lib/contentpage.js';

export async function onRequest({ request, env }) {
  const origin = env.SITE_URL || new URL(request.url).origin;
  const faq = {
    '@type': 'FAQPage',
    mainEntity: [
      { '@type': 'Question', name: 'À quel âge un mouton est-il prêt pour la Tabaski ?', acceptedAnswer: { '@type': 'Answer', text: 'Un mouton destiné au sacrifice doit généralement avoir au moins un an, avec des dents permanentes déjà sorties — un critère que les éleveurs sérieux vérifient et peuvent expliquer.' } },
      { '@type': 'Question', name: 'Faut-il acheter son mouton tôt ou attendre la dernière semaine ?', acceptedAnswer: { '@type': 'Answer', text: 'Acheter tôt permet souvent de meilleurs prix et un plus grand choix, mais implique de nourrir et loger l\'animal plus longtemps. Voir notre guide sur le budget et le calendrier de la Tabaski pour peser le pour et le contre.' } },
    ],
  };
  const body = `
<h1>Bien choisir son mouton de Tabaski : critères, poids et fourchette de prix</h1>
<p class="lead">Le choix du mouton est l'étape centrale de la préparation de la Tabaski. Voici les critères à vérifier pour faire un bon choix, sans se laisser surprendre sur le prix.</p>

<div class="tldr">
<h2>À retenir</h2>
<ul>
  <li>Vérifiez l'âge, la corpulence et l'état de santé général de l'animal avant d'acheter.</li>
  <li>Le prix varie fortement selon la race, le poids et la période d'achat (plus cher à l'approche de la fête).</li>
  <li>Un éleveur sérieux répond clairement à vos questions sur l'origine et l'alimentation de l'animal.</li>
</ul>
</div>

<h2>1. Les critères à vérifier</h2>
<ul>
  <li><strong>L'âge</strong> : les dents permanentes doivent être sorties, signe que l'animal a l'âge requis.</li>
  <li><strong>La corpulence</strong> : un mouton bien nourri a une silhouette pleine, sans être excessivement gras.</li>
  <li><strong>L'état de santé général</strong> : yeux clairs, démarche normale, pas de signe de maladie apparent.</li>
  <li><strong>La race</strong> : influence fortement le prix (certaines races locales très recherchées coûtent plus cher).</li>
</ul>

<h2>2. Le prix : ce qui le fait varier</h2>
<p>Le prix dépend du poids, de la race, de la période d'achat (les prix montent à l'approche de la fête) et de la région. Acheter plus tôt dans la saison permet souvent d'avoir plus de choix et de meilleurs prix, en contrepartie de devoir loger et nourrir l'animal plus longtemps — voir notre <a href="${origin}/blog/tabaski-guide-complet-senegal">guide complet Tabaski</a> pour le budget global et le calendrier.</p>

<h2>3. Où trouver un éleveur de confiance</h2>
<p>NEXUS Market référence des éleveurs et vendeurs de moutons dans plusieurs régions du Sénégal, avec leurs coordonnées directes. Consultez la <a href="${origin}/categorie/animaux">catégorie Animaux &amp; Élevage</a> pour comparer les offres disponibles.</p>

<a class="cta" href="${origin}/categorie/animaux">Voir les moutons disponibles →</a>
<p style="margin-top:1.4rem">Voir aussi : <a href="${origin}/blog">Tous les articles du blog</a> · <a href="${origin}/blog/tabaski-guide-complet-senegal">Tabaski au Sénégal : budget, calendrier et préparatifs</a></p>`;

  return contentResponse(renderContentPage({
    origin, path: '/blog/choisir-mouton-tabaski-criteres-prix',
    title: 'Bien choisir son mouton de Tabaski : critères, poids et fourchette de prix',
    description: 'Comment choisir un bon mouton pour la Tabaski au Sénégal : âge, corpulence, santé et ce qui influence le prix.',
    h1: 'Bien choisir son mouton de Tabaski : critères, poids et fourchette de prix', crumbName: 'Blog — Choisir son mouton',
    isArticle: true, datePublished: '2026-08-19', bodyHtml: body, extraGraph: [faq],
  }));
}
