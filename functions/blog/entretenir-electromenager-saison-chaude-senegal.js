// functions/blog/entretenir-electromenager-saison-chaude-senegal.js
import { renderContentPage, contentResponse } from '../_lib/contentpage.js';

export async function onRequest({ request, env }) {
  const origin = env.SITE_URL || new URL(request.url).origin;
  const faq = {
    '@type': 'FAQPage',
    mainEntity: [
      { '@type': 'Question', name: 'À quelle fréquence nettoyer le condenseur d\'un réfrigérateur ?', acceptedAnswer: { '@type': 'Answer', text: 'Un dépoussiérage tous les 2 à 3 mois suffit généralement, davantage en saison chaude où l\'appareil fonctionne plus intensément.' } },
      { '@type': 'Question', name: 'Les coupures de courant fréquentes abîment-elles l\'électroménager ?', acceptedAnswer: { '@type': 'Answer', text: 'Les variations de tension lors des coupures/reprises peuvent user prématurément certains composants ; un onduleur ou un stabilisateur de tension protège les appareils sensibles.' } },
    ],
  };
  const body = `
<h1>Bien entretenir son électroménager en saison chaude au Sénégal</h1>
<p class="lead">Réfrigérateurs, climatiseurs, ventilateurs : la chaleur sollicite fortement l'électroménager. Quelques gestes simples permettent de prolonger sa durée de vie et d'éviter les pannes coûteuses.</p>

<div class="tldr">
<h2>À retenir</h2>
<ul>
  <li>Dépoussiérez régulièrement les grilles et condenseurs pour une meilleure efficacité.</li>
  <li>Un onduleur ou stabilisateur protège les appareils sensibles des variations de tension.</li>
  <li>Un entretien préventif coûte toujours moins cher qu'une panne en pleine saison chaude.</li>
</ul>
</div>

<h2>1. Réfrigérateurs et congélateurs</h2>
<p>Le condenseur (souvent à l'arrière ou en dessous de l'appareil) accumule la poussière, ce qui réduit son efficacité et augmente la consommation électrique. Un dépoussiérage tous les 2 à 3 mois, plus fréquent en saison chaude, améliore les performances et prolonge la durée de vie de l'appareil.</p>

<h2>2. Climatiseurs et ventilateurs</h2>
<p>Nettoyez régulièrement les filtres du climatiseur, qui s'encrassent vite en saison sèche et poussiéreuse. Un filtre propre améliore le refroidissement et réduit la consommation électrique, un enjeu important pendant les mois les plus chauds.</p>

<h2>3. Se protéger des coupures de courant</h2>
<p>Les variations de tension lors des coupures et reprises de courant peuvent endommager progressivement les composants électroniques sensibles. Un onduleur ou un stabilisateur de tension, disponible dans la <a href="${origin}/categorie/maison">catégorie Maison & Déco</a>, protège efficacement les appareils les plus exposés.</p>

<h2>4. Bien choisir son électroménager d'occasion</h2>
<p>Pour un achat d'occasion, demandez toujours au vendeur si l'appareil a été utilisé intensément en saison chaude et s'il fonctionne encore normalement — un électroménager qui a beaucoup servi en climat chaud peut être plus sollicité qu'un modèle équivalent utilisé modérément.</p>

<h2>5. Anticiper plutôt que réparer dans l'urgence</h2>
<p>Un entretien régulier reste toujours moins coûteux qu'une panne en pleine saison chaude, période où la demande de réparation et de remplacement explose. Prévoir un contrôle avant les mois les plus chauds de l'année est un bon réflexe.</p>

<a class="cta" href="${origin}/categorie/maison">Découvrir la catégorie Maison & Déco →</a>
<p style="margin-top:1.4rem">Voir aussi : <a href="${origin}/blog">Tous les articles du blog</a> · <a href="${origin}/guides">Tous les guides</a></p>`;

  return contentResponse(renderContentPage({
    origin, path: '/blog/entretenir-electromenager-saison-chaude-senegal',
    title: 'Bien entretenir son électroménager en saison chaude au Sénégal',
    description: 'Conseils pour entretenir réfrigérateurs, climatiseurs et ventilateurs en saison chaude au Sénégal, et se protéger des coupures de courant.',
    h1: 'Bien entretenir son électroménager en saison chaude au Sénégal', crumbName: 'Blog — Entretien électroménager',
    isArticle: true, datePublished: '2026-07-06', bodyHtml: body, extraGraph: [faq],
  }));
}
