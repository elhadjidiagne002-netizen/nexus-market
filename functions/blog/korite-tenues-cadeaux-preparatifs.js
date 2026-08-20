// functions/blog/korite-tenues-cadeaux-preparatifs.js
import { renderContentPage, contentResponse } from '../_lib/contentpage.js';

export async function onRequest({ request, env }) {
  const origin = env.SITE_URL || new URL(request.url).origin;
  const faq = {
    '@type': 'FAQPage',
    mainEntity: [
      { '@type': 'Question', name: 'Quand commander sa tenue de Korité pour être sûr de l\'avoir à temps ?', acceptedAnswer: { '@type': 'Answer', text: 'Au moins deux à trois semaines avant, surtout pour une tenue sur-mesure ou personnalisée — les couturiers sont très sollicités en fin de Ramadan.' } },
      { '@type': 'Question', name: 'Le prix des tissus wax augmente-t-il avant la Korité ?', acceptedAnswer: { '@type': 'Answer', text: 'Oui, comme pour de nombreux produits saisonniers, la demande fait monter les prix à l\'approche de la fête — anticiper l\'achat du tissu permet souvent de mieux maîtriser son budget.' } },
    ],
  };
  const body = `
<h1>Korité : tenues, cadeaux et préparatifs</h1>
<p class="lead">La fin du Ramadan est marquée par la Korité, moment de fête en famille où les nouvelles tenues et les cadeaux tiennent une place importante. Voici comment bien vous organiser.</p>

<div class="tldr">
<h2>À retenir</h2>
<ul>
  <li>Commandez votre tenue au moins deux à trois semaines à l'avance, surtout pour du sur-mesure.</li>
  <li>Le prix des tissus (wax notamment) augmente à l'approche de la fête — anticipez l'achat.</li>
  <li>Prévoyez un budget dédié pour les cadeaux, souvent offerts aux enfants et aux proches.</li>
</ul>
</div>

<h2>1. Anticiper sa tenue</h2>
<p>Les couturiers sont particulièrement sollicités dans les dernières semaines du Ramadan. Commander tôt votre tissu et prendre rendez-vous avec votre couturier évite le stress de dernière minute et les prix gonflés par la forte demande — voir notre guide <a href="${origin}/blog/entretenir-vetements-wax-conseils">entretenir ses vêtements en wax</a> pour préserver votre nouvelle tenue après la fête.</p>

<h2>2. Le budget cadeaux</h2>
<p>Les cadeaux, notamment pour les enfants, font partie intégrante des traditions de la Korité. Prévoir ce budget à l'avance, en plus de celui des tenues, permet d'éviter les mauvaises surprises de dernière minute.</p>

<h2>3. Où trouver tissus et tenues</h2>
<p>NEXUS Market référence des tissus, tenues traditionnelles et couturiers dans la <a href="${origin}/categorie/mode">catégorie Mode &amp; Vêtements</a>, avec photos et prix affichés pour comparer facilement.</p>

<a class="cta" href="${origin}/categorie/mode">Voir les tenues et tissus →</a>
<p style="margin-top:1.4rem">Voir aussi : <a href="${origin}/blog">Tous les articles du blog</a> · <a href="${origin}/blog/ramadan-senegal-preparer-achats-budget">Ramadan : bien préparer ses achats et son budget</a></p>`;

  return contentResponse(renderContentPage({
    origin, path: '/blog/korite-tenues-cadeaux-preparatifs',
    title: 'Korité : tenues, cadeaux et préparatifs',
    description: 'Bien préparer la Korité au Sénégal : tenues, tissus, cadeaux et budget à anticiper avant la fin du Ramadan.',
    h1: 'Korité : tenues, cadeaux et préparatifs', crumbName: 'Blog — Korité',
    isArticle: true, datePublished: '2026-08-19', bodyHtml: body, extraGraph: [faq],
  }));
}
