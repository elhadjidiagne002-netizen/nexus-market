// functions/blog/diaspora-senegalaise-acheter-a-distance-famille.js
import { renderContentPage, contentResponse } from '../_lib/contentpage.js';

export async function onRequest({ request, env }) {
  const origin = env.SITE_URL || new URL(request.url).origin;
  const faq = {
    '@type': 'FAQPage',
    mainEntity: [
      { '@type': 'Question', name: 'Peut-on payer depuis l\'étranger pour une livraison au Sénégal ?', acceptedAnswer: { '@type': 'Answer', text: 'Oui, le paiement par carte bancaire fonctionne pour un achat depuis l\'étranger, avec livraison directe à l\'adresse de votre famille au Sénégal.' } },
      { '@type': 'Question', name: 'Comment être sûr que le produit sera bien livré à la bonne personne ?', acceptedAnswer: { '@type': 'Answer', text: 'Indiquez précisément le nom du destinataire et son numéro de téléphone lors de la commande — le livreur le contacte directement pour la remise.' } },
    ],
  };
  const body = `
<h1>Diaspora sénégalaise : comment acheter à distance pour sa famille au Sénégal</h1>
<p class="lead">Envoyer un cadeau, financer les préparatifs de la Tabaski ou aider sa famille au quotidien depuis l'étranger : NEXUS Market permet d'acheter à distance avec une livraison directe au Sénégal.</p>

<div class="tldr">
<h2>À retenir</h2>
<ul>
  <li>Le paiement par carte bancaire fonctionne depuis l'étranger, sans avoir besoin d'un compte mobile money local.</li>
  <li>Indiquez le nom et le numéro du destinataire pour une livraison directe.</li>
  <li>La livraison est disponible dans toutes les grandes villes du Sénégal, pas seulement à Dakar.</li>
</ul>
</div>

<h2>1. Comment ça fonctionne</h2>
<p>Depuis l'étranger, vous pouvez parcourir le catalogue NEXUS Market, choisir un produit et payer par carte bancaire (voir notre guide <a href="${origin}/blog/payer-carte-bancaire-en-ligne-securite-senegal">payer par carte en ligne : est-ce sécurisé ?</a>), puis indiquer l'adresse et les coordonnées de votre proche au Sénégal pour la livraison.</p>

<h2>2. Ce qu'on peut acheter à distance</h2>
<ul>
  <li><strong>Un mouton pour la Tabaski</strong>, livré directement chez votre famille.</li>
  <li><strong>De l'électroménager ou du mobilier</strong> pour équiper un logement.</li>
  <li><strong>Des services</strong> : faire intervenir un artisan (NEXUS Pro) pour des travaux chez un proche, sans être présent sur place.</li>
  <li><strong>Un cadeau ponctuel</strong> pour un anniversaire ou un événement familial.</li>
</ul>

<h2>3. Bien préparer sa commande à distance</h2>
<p>Précisez toujours le nom complet et le numéro de téléphone actif du destinataire, ainsi qu'une adresse aussi précise que possible (quartier, point de repère). Le livreur contacte directement le destinataire pour organiser la remise.</p>

<a class="cta" href="${origin}/">Découvrir le catalogue →</a>
<p style="margin-top:1.4rem">Voir aussi : <a href="${origin}/blog">Tous les articles du blog</a> · <a href="${origin}/blog/choisir-mouton-tabaski-criteres-prix">Bien choisir son mouton de Tabaski</a></p>`;

  return contentResponse(renderContentPage({
    origin, path: '/blog/diaspora-senegalaise-acheter-a-distance-famille',
    title: 'Diaspora sénégalaise : comment acheter à distance pour sa famille au Sénégal',
    description: 'Acheter depuis l\'étranger et faire livrer directement à sa famille au Sénégal : paiement, adresse et bons réflexes.',
    h1: 'Diaspora sénégalaise : comment acheter à distance pour sa famille au Sénégal', crumbName: 'Blog — Achat pour la diaspora',
    isArticle: true, datePublished: '2026-08-19', bodyHtml: body, extraGraph: [faq],
  }));
}
