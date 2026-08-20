// functions/blog/troc-senegal-comment-bien-echanger.js
import { renderContentPage, contentResponse } from '../_lib/contentpage.js';

export async function onRequest({ request, env }) {
  const origin = env.SITE_URL || new URL(request.url).origin;
  const faq = {
    '@type': 'FAQPage',
    mainEntity: [
      { '@type': 'Question', name: 'Peut-on négocier un échange avec une petite compensation en argent ?', acceptedAnswer: { '@type': 'Answer', text: 'Oui, c\'est fréquent lorsque les objets échangés n\'ont pas exactement la même valeur — précisez-le clairement dans votre annonce si c\'est envisageable.' } },
      { '@type': 'Question', name: 'Comment estimer la valeur d\'un objet pour un troc équitable ?', acceptedAnswer: { '@type': 'Answer', text: 'Comparez son prix de revente habituel (état, âge, demande) à celui de l\'objet que vous souhaitez obtenir en échange — la même logique que pour fixer un prix de vente classique.' } },
    ],
  };
  const body = `
<h1>Le troc au Sénégal : comment bien échanger un objet sans argent</h1>
<p class="lead">Le troc reprend de l'ampleur comme alternative économique à la revente classique. Voici comment échanger vos objets efficacement et sans mauvaise surprise.</p>

<div class="tldr">
<h2>À retenir</h2>
<ul>
  <li>Décrivez précisément l'objet proposé ET ce que vous recherchez en échange.</li>
  <li>Une petite compensation en argent peut équilibrer un échange entre objets de valeur différente.</li>
  <li>Vérifiez l'objet en personne avant de finaliser l'échange, comme pour un achat classique.</li>
</ul>
</div>

<h2>1. Bien décrire son annonce de troc</h2>
<ul>
  <li><strong>L'objet proposé</strong> : état, âge, photos claires.</li>
  <li><strong>Ce que vous recherchez en échange</strong> : soyez précis pour attirer les bonnes propositions.</li>
  <li><strong>Si une compensation en argent est envisageable</strong> en cas de différence de valeur.</li>
</ul>

<h2>2. Estimer une valeur d'échange équitable</h2>
<p>Comparez le prix de revente habituel de votre objet à celui de l'objet recherché — la même méthode que pour fixer un prix de vente classique. Voir notre guide <a href="${origin}/blog/comment-fixer-prix-revente-objet-occasion">comment fixer le juste prix d'un objet d'occasion</a> pour la méthode complète.</p>

<h2>3. Sécuriser l'échange</h2>
<p>Comme pour tout achat entre particuliers, vérifiez l'objet en personne avant de finaliser l'échange, dans un lieu sûr si possible. Méfiez-vous des propositions d'échange à distance sans possibilité de vérification préalable.</p>

<h2>4. Publier votre annonce de troc</h2>
<p>NEXUS Market propose un espace dédié au troc pour publier vos objets à échanger et trouver des propositions correspondant à vos besoins.</p>

<a class="cta" href="${origin}/troc">Voir les annonces de troc →</a>
<p style="margin-top:1.4rem">Voir aussi : <a href="${origin}/blog">Tous les articles du blog</a> · <a href="${origin}/guide/troc-echanger-objets-senegal">Guide complet du troc au Sénégal</a></p>`;

  return contentResponse(renderContentPage({
    origin, path: '/blog/troc-senegal-comment-bien-echanger',
    title: 'Le troc au Sénégal : comment bien échanger un objet sans argent',
    description: 'Comment bien rédiger une annonce de troc, estimer une valeur d\'échange équitable et sécuriser l\'échange au Sénégal.',
    h1: 'Le troc au Sénégal : comment bien échanger un objet sans argent', crumbName: 'Blog — Troc',
    isArticle: true, datePublished: '2026-08-19', bodyHtml: body, extraGraph: [faq],
  }));
}
