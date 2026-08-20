// functions/blog/assistant-ia-nexus-trouver-produit.js
import { renderContentPage, contentResponse } from '../_lib/contentpage.js';

export async function onRequest({ request, env }) {
  const origin = env.SITE_URL || new URL(request.url).origin;
  const faq = {
    '@type': 'FAQPage',
    mainEntity: [
      { '@type': 'Question', name: 'L\'assistant IA NEXUS remplace-t-il la recherche classique ?', acceptedAnswer: { '@type': 'Answer', text: 'Non, il la complète — utile quand vous ne savez pas exactement quel mot-clé chercher, ou que vous avez une question précise (budget, usage) plutôt qu\'un nom de produit.' } },
      { '@type': 'Question', name: 'L\'assistant est-il gratuit à utiliser ?', acceptedAnswer: { '@type': 'Answer', text: 'Oui, il est accessible gratuitement à tous les utilisateurs de NEXUS Market.' } },
    ],
  };
  const body = `
<h1>Assistant IA NEXUS : comment il peut vous aider à trouver ce que vous cherchez</h1>
<p class="lead">Vous ne savez pas exactement quel produit chercher, ou vous avez une question précise sur un achat ? L'assistant IA de NEXUS Market peut vous orienter directement.</p>

<div class="tldr">
<h2>À retenir</h2>
<ul>
  <li>L'assistant comprend des questions en langage naturel, pas seulement des mots-clés précis.</li>
  <li>Utile pour affiner un besoin (budget, usage) plutôt que pour chercher un nom de produit exact.</li>
  <li>Complète la recherche classique, ne la remplace pas.</li>
</ul>
</div>

<h2>1. Quand utiliser l'assistant plutôt que la recherche classique</h2>
<p>Si vous savez exactement ce que vous cherchez (un nom de produit précis), la recherche classique reste la plus rapide. L'assistant devient utile quand votre besoin est plus flou : "un cadeau pour un anniversaire d'enfant à moins de 20 000 FCFA" ou "un artisan pour refaire ma peinture à Dakar" — des questions qu'une simple barre de recherche par mot-clé gère mal.</p>

<h2>2. Ce que l'assistant peut faire</h2>
<ul>
  <li>Vous orienter vers la bonne catégorie ou le bon service selon votre besoin décrit en langage courant.</li>
  <li>Répondre à des questions générales sur le fonctionnement de la marketplace (paiement, livraison, garantie).</li>
  <li>Vous aider à affiner votre recherche quand vous ne trouvez pas ce que vous cherchez du premier coup.</li>
</ul>

<h2>3. Essayer l'assistant</h2>
<p>L'assistant est accessible directement depuis le site, gratuitement pour tous les utilisateurs.</p>

<a class="cta" href="${origin}/assistant">Discuter avec l'assistant →</a>
<p style="margin-top:1.4rem">Voir aussi : <a href="${origin}/blog">Tous les articles du blog</a> · <a href="${origin}/faq">Questions fréquentes</a></p>`;

  return contentResponse(renderContentPage({
    origin, path: '/blog/assistant-ia-nexus-trouver-produit',
    title: 'Assistant IA NEXUS : comment il peut vous aider à trouver ce que vous cherchez',
    description: 'L\'assistant IA de NEXUS Market : quand l\'utiliser plutôt que la recherche classique et ce qu\'il peut faire pour vous.',
    h1: 'Assistant IA NEXUS : comment il peut vous aider à trouver ce que vous cherchez', crumbName: 'Blog — Assistant IA',
    isArticle: true, datePublished: '2026-08-19', bodyHtml: body, extraGraph: [faq],
  }));
}
