// functions/blog/bijoux-artisanat-senegalais-authentique.js
import { renderContentPage, contentResponse } from '../_lib/contentpage.js';

export async function onRequest({ request, env }) {
  const origin = env.SITE_URL || new URL(request.url).origin;
  const faq = {
    '@type': 'FAQPage',
    mainEntity: [
      { '@type': 'Question', name: 'Comment savoir si un bijou est en or véritable ?', acceptedAnswer: { '@type': 'Answer', text: 'Vérifiez la présence d\'un poinçon et testez la réaction à l\'aimant (l\'or véritable n\'est pas magnétique) — voir notre guide dédié pour la méthode complète.' } },
      { '@type': 'Question', name: 'L\'artisanat sénégalais fait main coûte-t-il plus cher que les articles importés ?', acceptedAnswer: { '@type': 'Answer', text: 'Souvent oui, car il s\'agit d\'un travail manuel et de matières premières locales — mais la qualité et l\'authenticité justifient généralement l\'écart de prix par rapport à une production industrielle importée.' } },
    ],
  };
  const body = `
<h1>Bijoux et artisanat sénégalais : où acheter authentique</h1>
<p class="lead">Bijoux en or, sculptures, maroquinerie : l'artisanat sénégalais a un savoir-faire reconnu. Voici comment reconnaître les pièces authentiques et bien choisir son vendeur.</p>

<div class="tldr">
<h2>À retenir</h2>
<ul>
  <li>Pour l'or, vérifiez toujours le poinçon et la réaction à l'aimant avant d'acheter.</li>
  <li>L'artisanat fait main coûte généralement plus cher qu'une production importée — c'est normal et justifié par la qualité.</li>
  <li>Demandez l'origine et la méthode de fabrication au vendeur pour les pièces artisanales.</li>
</ul>
</div>

<h2>1. Bijoux : les points de vérification</h2>
<p>Pour un bijou en or, vérifiez la présence d'un poinçon et testez sa réaction à un aimant (l'or véritable n'y réagit pas) — voir notre guide complet <a href="${origin}/blog/reconnaitre-bijou-or-veritable">reconnaître un bijou en or véritable</a> pour tous les critères.</p>

<h2>2. L'artisanat : sculptures, maroquinerie, textile</h2>
<p>Le Sénégal a un savoir-faire reconnu en maroquinerie, sculpture sur bois et textile traditionnel (wax, bogolan). Une pièce artisanale authentique porte souvent les traces d'un travail manuel — de légères irrégularités qui témoignent du fait main, contrairement à une production industrielle parfaitement uniforme.</p>

<h2>3. Bien choisir son vendeur</h2>
<ul>
  <li>Demandez l'origine de la pièce et la méthode de fabrication.</li>
  <li>Comparez les prix avec d'autres pièces similaires — un prix anormalement bas pour de l'artisanat fait main peut indiquer une production industrielle importée.</li>
  <li>Privilégiez les vendeurs qui peuvent expliquer clairement leur travail.</li>
</ul>

<h2>4. Trouver des pièces authentiques</h2>
<p>NEXUS Market référence des bijoux et pièces d'artisanat sénégalais dans la <a href="${origin}/categorie/mode">catégorie Mode &amp; Vêtements</a>, avec photos et description détaillée de chaque pièce.</p>

<a class="cta" href="${origin}/categorie/mode">Voir les bijoux et artisanat →</a>
<p style="margin-top:1.4rem">Voir aussi : <a href="${origin}/blog">Tous les articles du blog</a> · <a href="${origin}/blog/reconnaitre-bijou-or-veritable">Reconnaître un bijou en or véritable</a></p>`;

  return contentResponse(renderContentPage({
    origin, path: '/blog/bijoux-artisanat-senegalais-authentique',
    title: 'Bijoux et artisanat sénégalais : où acheter authentique',
    description: 'Comment reconnaître des bijoux et pièces d\'artisanat sénégalais authentiques, et bien choisir son vendeur.',
    h1: 'Bijoux et artisanat sénégalais : où acheter authentique', crumbName: 'Blog — Artisanat sénégalais',
    isArticle: true, datePublished: '2026-08-19', bodyHtml: body, extraGraph: [faq],
  }));
}
