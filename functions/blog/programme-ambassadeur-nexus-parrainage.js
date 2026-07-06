// functions/blog/programme-ambassadeur-nexus-parrainage.js
import { renderContentPage, contentResponse } from '../_lib/contentpage.js';

export async function onRequest({ request, env }) {
  const origin = env.SITE_URL || new URL(request.url).origin;
  const faq = {
    '@type': 'FAQPage',
    mainEntity: [
      { '@type': 'Question', name: 'Comment devenir ambassadeur NEXUS ?', acceptedAnswer: { '@type': 'Answer', text: 'Connectez-vous à votre compte NEXUS Market, puis rendez-vous dans la section « Programme Ambassadeur » de votre espace acheteur pour récupérer votre lien de parrainage.' } },
      { '@type': 'Question', name: 'La commission est-elle versée une seule fois ?', acceptedAnswer: { '@type': 'Answer', text: 'La commission s\'applique sur les achats réalisés par les filleuls via votre lien de parrainage, selon les conditions en vigueur du programme.' } },
    ],
  };
  const body = `
<h1>Programme Ambassadeur NEXUS : gagner en parrainant vos proches</h1>
<p class="lead">Peu connu mais déjà actif sur NEXUS Market, le programme Ambassadeur permet de gagner une commission en recommandant la marketplace à vos proches. Voici comment il fonctionne.</p>

<div class="tldr">
<h2>À retenir</h2>
<ul>
  <li>Vous gagnez une commission sur les achats de vos filleuls, en partageant simplement votre lien.</li>
  <li>Aucun investissement de départ n'est nécessaire pour devenir ambassadeur.</li>
  <li>Accessible depuis votre espace acheteur, une fois connecté.</li>
</ul>
</div>

<h2>1. Le principe</h2>
<p>Le programme Ambassadeur récompense les utilisateurs qui font connaître NEXUS Market autour d'eux. En partageant votre lien de parrainage personnel avec vos proches, vous touchez une commission sur les achats qu'ils réalisent ensuite sur la plateforme.</p>

<h2>2. Comment y accéder</h2>
<p>Depuis votre compte NEXUS Market, la section « Programme Ambassadeur » de votre espace acheteur vous donne accès à votre lien personnel ainsi qu'à un suivi de vos filleuls et des commissions générées.</p>

<h2>3. À qui s'adresse ce programme</h2>
<p>Que vous soyez déjà acheteur régulier ou simplement actif sur les réseaux sociaux au Sénégal, ce programme ne demande aucune compétence particulière : il suffit de partager votre expérience et votre lien avec votre entourage.</p>

<h2>4. Un complément aux autres avantages NEXUS</h2>
<p>Le programme Ambassadeur peut se cumuler avec le <a href="${origin}/fidelite">programme de fidélité</a>, qui récompense de son côté vos propres achats sur la plateforme.</p>

<a class="cta" href="${origin}/">Créer mon compte NEXUS →</a>
<p style="margin-top:1.4rem">Voir aussi : <a href="${origin}/blog">Tous les articles du blog</a> · <a href="${origin}/guides">Tous les guides</a></p>`;

  return contentResponse(renderContentPage({
    origin, path: '/blog/programme-ambassadeur-nexus-parrainage',
    title: 'Programme Ambassadeur NEXUS : gagner en parrainant vos proches',
    description: 'Comment fonctionne le programme Ambassadeur de NEXUS Market : parrainez vos proches et gagnez une commission sur leurs achats.',
    h1: 'Programme Ambassadeur NEXUS : gagner en parrainant vos proches', crumbName: 'Blog — Programme Ambassadeur',
    isArticle: true, datePublished: '2026-07-06', bodyHtml: body, extraGraph: [faq],
  }));
}
