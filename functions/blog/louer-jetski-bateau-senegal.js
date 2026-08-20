// functions/blog/louer-jetski-bateau-senegal.js
import { renderContentPage, contentResponse } from '../_lib/contentpage.js';

export async function onRequest({ request, env }) {
  const origin = env.SITE_URL || new URL(request.url).origin;
  const faq = {
    '@type': 'FAQPage',
    mainEntity: [
      { '@type': 'Question', name: 'Faut-il un permis pour piloter un jet-ski au Sénégal ?', acceptedAnswer: { '@type': 'Answer', text: 'Pour une session encadrée par un prestataire, un permis n\'est généralement pas exigé — une brève initiation est donnée sur place. Pour une location libre plus longue, certains prestataires demandent une expérience préalable.' } },
      { '@type': 'Question', name: 'Quelle est la durée moyenne d\'une session de jet-ski ?', acceptedAnswer: { '@type': 'Answer', text: 'Les sessions standards durent souvent entre 15 et 30 minutes, avec des formules plus longues disponibles chez certains prestataires.' } },
      { '@type': 'Question', name: 'La caution est-elle remboursée après la sortie ?', acceptedAnswer: { '@type': 'Answer', text: 'Oui, si l\'équipement est rendu en bon état — elle sert à couvrir d\'éventuels dommages pendant la session.' } },
    ],
  };
  const body = `
<h1>Louer un jet-ski ou un bateau au Sénégal : ce qu'il faut vérifier avant de réserver</h1>
<p class="lead">Entre les plages de la Petite Côte et le littoral dakarois, les activités nautiques attirent de plus en plus d'amateurs de sensations. Voici les points à vérifier avant de réserver une sortie en jet-ski ou en bateau.</p>

<div class="tldr">
<h2>À retenir</h2>
<ul>
  <li>Vérifiez toujours si un équipement de sécurité (gilet de sauvetage) est inclus.</li>
  <li>Comparez le prix par session avec la caution demandée et les conditions d'annulation en cas de mauvaise météo.</li>
  <li>Privilégiez un prestataire qui donne une brève initiation avant le départ.</li>
</ul>
</div>

<h2>1. Ce qu'il faut vérifier avant de réserver</h2>
<ul>
  <li><strong>Équipement de sécurité</strong> : gilet de sauvetage obligatoire, fourni ou à apporter ?</li>
  <li><strong>Météo et conditions de mer</strong> : demandez la politique d'annulation ou de report en cas de vent fort.</li>
  <li><strong>Zone de navigation autorisée</strong> : certains prestataires limitent la sortie à une zone balisée, plus sécurisante pour les débutants.</li>
  <li><strong>Caution</strong> : montant et modalités de restitution après la sortie.</li>
</ul>

<h2>2. Jet-ski, bateau ou sortie pêche : quelle activité choisir ?</h2>
<p>Le jet-ski convient pour une session courte et intense. Un bateau (avec ou sans skipper) permet une sortie plus longue, en groupe, idéale pour une balade en famille. Pour les amateurs de pêche, certains prestataires proposent des sorties dédiées avec matériel inclus.</p>

<h2>3. Trouver un prestataire près de chez vous</h2>
<p>NEXUS Market référence des prestataires d'activités nautiques (jet-ski, bateau, pêche en mer) dans plusieurs zones du littoral sénégalais, avec leurs tarifs et contacts directs. Consultez la <a href="${origin}/categorie/sport">catégorie Sport &amp; Loisirs</a> pour comparer les options disponibles.</p>

<a class="cta" href="${origin}/categorie/sport">Voir les activités nautiques →</a>
<p style="margin-top:1.4rem">Voir aussi : <a href="${origin}/blog">Tous les articles du blog</a> · <a href="${origin}/blog/organiser-evenement-mariage-bapteme-materiel-loue">Organiser un événement avec du matériel loué</a></p>`;

  return contentResponse(renderContentPage({
    origin, path: '/blog/louer-jetski-bateau-senegal',
    title: 'Louer un jet-ski ou un bateau au Sénégal : ce qu\'il faut vérifier',
    description: 'Location de jet-ski, bateau ou sortie pêche au Sénégal : sécurité, prix, caution et conseils avant de réserver votre activité nautique.',
    h1: 'Louer un jet-ski ou un bateau au Sénégal : ce qu\'il faut vérifier avant de réserver', crumbName: 'Blog — Activités nautiques',
    isArticle: true, datePublished: '2026-08-19', bodyHtml: body, extraGraph: [faq],
  }));
}
