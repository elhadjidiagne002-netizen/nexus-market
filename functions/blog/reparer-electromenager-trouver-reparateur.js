// functions/blog/reparer-electromenager-trouver-reparateur.js
import { renderContentPage, contentResponse } from '../_lib/contentpage.js';

export async function onRequest({ request, env }) {
  const origin = env.SITE_URL || new URL(request.url).origin;
  const faq = {
    '@type': 'FAQPage',
    mainEntity: [
      { '@type': 'Question', name: 'À partir de quel coût de réparation vaut-il mieux racheter l\'appareil ?', acceptedAnswer: { '@type': 'Answer', text: 'En règle générale, si la réparation dépasse la moitié du prix d\'un appareil neuf équivalent, le rachat devient souvent plus intéressant — sauf pour un appareil récent ou haut de gamme.' } },
      { '@type': 'Question', name: 'Faut-il toujours demander un devis avant de faire réparer un appareil ?', acceptedAnswer: { '@type': 'Answer', text: 'Oui, systématiquement — certains diagnostics sont gratuits, d\'autres facturés même sans réparation effectuée, à clarifier avant de déposer l\'appareil.' } },
    ],
  };
  const body = `
<h1>Réparer plutôt que jeter : où trouver un réparateur électroménager</h1>
<p class="lead">Avant de racheter un appareil en panne, la réparation reste souvent l'option la plus économique et la plus écologique. Voici comment savoir quand réparer et où trouver un bon réparateur.</p>

<div class="tldr">
<h2>À retenir</h2>
<ul>
  <li>Si la réparation coûte plus de la moitié du prix d'un appareil neuf équivalent, le rachat est souvent plus judicieux.</li>
  <li>Demandez toujours un devis avant de faire réparer, certains diagnostics étant facturés même sans réparation.</li>
  <li>Un appareil récent ou haut de gamme mérite généralement d'être réparé plutôt que remplacé.</li>
</ul>
</div>

<h2>1. Réparer ou racheter : comment décider</h2>
<p>Comparez toujours le coût de la réparation au prix d'un appareil neuf équivalent. Pour un appareil récent ou de qualité, la réparation reste presque toujours l'option la plus économique. Pour un appareil ancien déjà proche de sa fin de vie, le rachat peut être plus pertinent — voir aussi notre guide <a href="${origin}/blog/entretenir-electromenager-saison-chaude-senegal">bien entretenir son électroménager en saison chaude</a> pour éviter les pannes.</p>

<h2>2. Bien choisir son réparateur</h2>
<ul>
  <li><strong>Demandez un devis</strong> avant toute intervention.</li>
  <li><strong>Vérifiez l'expérience</strong> sur le type d'appareil concerné.</li>
  <li><strong>Renseignez-vous sur la garantie</strong> offerte après la réparation.</li>
</ul>

<h2>3. Trouver un réparateur près de chez vous</h2>
<p>NEXUS Pro référence des artisans et techniciens géolocalisés au Sénégal, avec leur spécialité et leur expérience affichées sur chaque profil.</p>

<a class="cta" href="${origin}/?pro=1">Trouver un réparateur →</a>
<p style="margin-top:1.4rem">Voir aussi : <a href="${origin}/blog">Tous les articles du blog</a> · <a href="${origin}/blog/entretenir-electromenager-saison-chaude-senegal">Bien entretenir son électroménager</a></p>`;

  return contentResponse(renderContentPage({
    origin, path: '/blog/reparer-electromenager-trouver-reparateur',
    title: 'Réparer plutôt que jeter : où trouver un réparateur électroménager',
    description: 'Réparer ou racheter un appareil électroménager en panne : comment décider et où trouver un bon réparateur au Sénégal.',
    h1: 'Réparer plutôt que jeter : où trouver un réparateur électroménager', crumbName: 'Blog — Réparation électroménager',
    isArticle: true, datePublished: '2026-08-19', bodyHtml: body, extraGraph: [faq],
  }));
}
