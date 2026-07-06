// functions/blog/bien-choisir-voiture-occasion-senegal.js
import { renderContentPage, contentResponse } from '../_lib/contentpage.js';

export async function onRequest({ request, env }) {
  const origin = env.SITE_URL || new URL(request.url).origin;
  const faq = {
    '@type': 'FAQPage',
    mainEntity: [
      { '@type': 'Question', name: 'Quels documents demander avant d\'acheter une voiture d\'occasion ?', acceptedAnswer: { '@type': 'Answer', text: 'La carte grise au nom du vendeur, le certificat de non-gage, et si possible le carnet d\'entretien du véhicule.' } },
      { '@type': 'Question', name: 'Un contrôle technique récent est-il indispensable ?', acceptedAnswer: { '@type': 'Answer', text: 'Ce n\'est pas toujours obligatoire selon l\'âge du véhicule, mais un contrôle technique récent rassure sur l\'état mécanique réel de la voiture avant l\'achat.' } },
    ],
  };
  const body = `
<h1>Bien choisir sa voiture d'occasion au Sénégal : les points de contrôle</h1>
<p class="lead">Entre le prix d'achat, l'entretien et la revente future, une voiture d'occasion est un investissement important. Voici les vérifications essentielles avant de signer.</p>

<div class="tldr">
<h2>À retenir</h2>
<ul>
  <li>Vérifiez systématiquement les documents administratifs (carte grise, certificat de non-gage).</li>
  <li>Un essai routier est indispensable, même pour un véhicule qui semble en bon état visuellement.</li>
  <li>Le kilométrage et l'historique d'entretien comptent souvent plus que l'année du modèle.</li>
</ul>
</div>

<h2>1. Vérifier les papiers avant toute chose</h2>
<p>Avant même de regarder le moteur, exigez la carte grise au nom du vendeur (ou une procuration en règle) et, si possible, un certificat de non-gage attestant que le véhicule n'est pas sous hypothèque ou saisi. Ces documents évitent bien des déconvenues après l'achat.</p>

<h2>2. Examiner l'état général du véhicule</h2>
<ul>
  <li><strong>Carrosserie</strong> : traces de chocs mal réparés, différences de teinte entre panneaux.</li>
  <li><strong>Pneus</strong> : usure irrégulière pouvant révéler un problème de parallélisme.</li>
  <li><strong>Intérieur</strong> : état des sièges et de la sellerie, cohérence avec le kilométrage affiché.</li>
  <li><strong>Sous le capot</strong> : traces de fuite d'huile ou de liquide de refroidissement.</li>
</ul>

<h2>3. L'essai routier, une étape non négociable</h2>
<p>Un essai sur route permet de repérer des bruits suspects, un comportement moteur anormal, ou des freins qui répondent mal. Ne vous fiez jamais uniquement à un véhicule à l'arrêt, moteur éteint.</p>

<h2>4. Kilométrage et historique d'entretien</h2>
<p>Un véhicule avec un kilométrage élevé mais un entretien régulier et documenté peut être un meilleur choix qu'un véhicule à faible kilométrage sans aucun historique. Demandez toujours les factures d'entretien si elles existent.</p>

<h2>5. Négocier en connaissance de cause</h2>
<p>Une fois les vérifications faites, comparez le prix demandé à celui de véhicules similaires disponibles au même moment sur la <a href="${origin}/categorie/auto">catégorie Auto & Moto</a>, pour évaluer si le prix est cohérent avec le marché.</p>

<a class="cta" href="${origin}/categorie/auto">Voir les annonces auto →</a>
<p style="margin-top:1.4rem">Voir aussi : <a href="${origin}/blog">Tous les articles du blog</a> · <a href="${origin}/guides">Tous les guides</a></p>`;

  return contentResponse(renderContentPage({
    origin, path: '/blog/bien-choisir-voiture-occasion-senegal',
    title: 'Bien choisir sa voiture d\'occasion au Sénégal',
    description: 'Les points de contrôle essentiels avant d\'acheter une voiture d\'occasion au Sénégal : papiers, état général, essai routier, kilométrage.',
    h1: 'Bien choisir sa voiture d\'occasion au Sénégal : les points de contrôle', crumbName: 'Blog — Voiture d\'occasion',
    isArticle: true, datePublished: '2026-07-06', bodyHtml: body, extraGraph: [faq],
  }));
}
