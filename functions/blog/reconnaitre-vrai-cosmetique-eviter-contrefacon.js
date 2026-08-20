// functions/blog/reconnaitre-vrai-cosmetique-eviter-contrefacon.js
import { renderContentPage, contentResponse } from '../_lib/contentpage.js';

export async function onRequest({ request, env }) {
  const origin = env.SITE_URL || new URL(request.url).origin;
  const faq = {
    '@type': 'FAQPage',
    mainEntity: [
      { '@type': 'Question', name: 'Un prix très bas est-il toujours signe de contrefaçon pour un cosmétique de marque ?', acceptedAnswer: { '@type': 'Answer', text: 'Pas systématiquement, mais un prix très inférieur au marché pour une marque reconnue mérite une vérification supplémentaire de l\'emballage et de la texture du produit.' } },
      { '@type': 'Question', name: 'Comment vérifier l\'authenticité d\'un parfum ?', acceptedAnswer: { '@type': 'Answer', text: 'Vérifiez la qualité d\'impression de l\'emballage, le numéro de lot présent sur la boîte et le flacon (ils doivent correspondre), et la tenue du parfum dans le temps — un faux s\'estompe souvent plus vite.' } },
    ],
  };
  const body = `
<h1>Reconnaître un vrai cosmétique importé (éviter les contrefaçons)</h1>
<p class="lead">Crèmes, parfums, produits de soin : le marché des cosmétiques importés attire aussi les contrefaçons. Voici comment vérifier l'authenticité avant d'acheter.</p>

<div class="tldr">
<h2>À retenir</h2>
<ul>
  <li>Vérifiez la qualité de l'emballage et la présence d'un numéro de lot cohérent entre la boîte et le produit.</li>
  <li>Un prix nettement inférieur au marché pour une grande marque mérite une vérification supplémentaire.</li>
  <li>La texture, l'odeur et la tenue dans le temps sont de bons indicateurs d'authenticité.</li>
</ul>
</div>

<h2>1. Les signes d'un produit authentique</h2>
<ul>
  <li><strong>Emballage soigné</strong> : impression nette, pas de fautes, finitions propres.</li>
  <li><strong>Numéro de lot cohérent</strong> entre l'emballage extérieur et le produit lui-même.</li>
  <li><strong>Texture et odeur conformes</strong> à ce qui est attendu pour la marque et le produit.</li>
  <li><strong>Prix cohérent</strong> avec le marché — méfiez-vous des prix trop bas pour de grandes marques.</li>
</ul>

<h2>2. Où le risque est le plus élevé</h2>
<p>Les parfums et crèmes de grandes marques sont les produits les plus fréquemment contrefaits, en raison de leur prix élevé à l'état neuf. Une vigilance particulière est recommandée pour ces catégories.</p>

<h2>3. Bien choisir son vendeur</h2>
<p>Privilégiez les vendeurs qui décrivent précisément l'origine de leurs produits et répondent clairement à vos questions. NEXUS Market référence des produits de beauté dans la <a href="${origin}/categorie/beaute">catégorie Beauté &amp; Santé</a>.</p>

<a class="cta" href="${origin}/categorie/beaute">Voir les produits de beauté →</a>
<p style="margin-top:1.4rem">Voir aussi : <a href="${origin}/blog">Tous les articles du blog</a> · <a href="${origin}/blog/reperer-fausse-annonce-vendeur-non-fiable">Repérer une fausse annonce ou un vendeur non fiable</a></p>`;

  return contentResponse(renderContentPage({
    origin, path: '/blog/reconnaitre-vrai-cosmetique-eviter-contrefacon',
    title: 'Reconnaître un vrai cosmétique importé (éviter les contrefaçons)',
    description: 'Comment vérifier l\'authenticité d\'un cosmétique ou parfum importé au Sénégal et éviter les contrefaçons.',
    h1: 'Reconnaître un vrai cosmétique importé (éviter les contrefaçons)', crumbName: 'Blog — Cosmétiques authentiques',
    isArticle: true, datePublished: '2026-08-19', bodyHtml: body, extraGraph: [faq],
  }));
}
