// functions/blog/acheter-meubles-senegal-neuf-occasion.js
import { renderContentPage, contentResponse } from '../_lib/contentpage.js';

export async function onRequest({ request, env }) {
  const origin = env.SITE_URL || new URL(request.url).origin;
  const faq = {
    '@type': 'FAQPage',
    mainEntity: [
      { '@type': 'Question', name: 'Comment vérifier la qualité d\'un meuble d\'occasion avant achat ?', acceptedAnswer: { '@type': 'Answer', text: 'Vérifiez la stabilité de la structure, l\'état du bois ou du tissu, et l\'absence de traces d\'humidité ou d\'insectes — des photos sous plusieurs angles dans l\'annonce aident déjà beaucoup à se faire une idée.' } },
      { '@type': 'Question', name: 'La livraison de meubles volumineux est-elle possible ?', acceptedAnswer: { '@type': 'Answer', text: 'Oui, la livraison est possible partout au Sénégal — voir notre guide sur les frais de livraison pour le détail selon le volume et la distance.' } },
    ],
  };
  const body = `
<h1>Acheter des meubles au Sénégal : neuf vs occasion, livraison</h1>
<p class="lead">Meubler un logement représente souvent un budget conséquent. Voici comment faire les bons choix entre neuf et occasion, et bien gérer la livraison.</p>

<div class="tldr">
<h2>À retenir</h2>
<ul>
  <li>Un meuble d'occasion en bon état permet souvent d'économiser significativement, surtout pour les grandes pièces.</li>
  <li>Vérifiez toujours la stabilité et l'état général avant d'acheter, via des photos détaillées ou une visite.</li>
  <li>Anticipez les frais et contraintes de livraison pour les meubles volumineux.</li>
</ul>
</div>

<h2>1. Neuf ou occasion : comment choisir</h2>
<p>Le neuf offre une garantie et un état irréprochable, mais à un coût plus élevé. L'occasion permet souvent d'obtenir des pièces de meilleure qualité (bois massif, marques reconnues) pour un budget équivalent à du neuf d'entrée de gamme — à condition de bien vérifier l'état avant d'acheter.</p>

<h2>2. Ce qu'il faut vérifier sur un meuble d'occasion</h2>
<ul>
  <li><strong>La structure</strong> : stabilité, absence de fissures ou de jeu dans les assemblages.</li>
  <li><strong>Le bois ou le tissu</strong> : traces d'humidité, d'insectes, usure excessive.</li>
  <li><strong>Les dimensions exactes</strong> : vérifiez qu'elles conviennent à votre espace avant d'acheter.</li>
</ul>

<h2>3. La livraison de meubles volumineux</h2>
<p>Pour les grandes pièces (canapé, armoire, table), vérifiez les conditions de livraison avec le vendeur ou via le service NEXUS avant de finaliser l'achat — voir notre guide <a href="${origin}/guide/comprendre-frais-livraison-dakar">comprendre les frais de livraison</a> pour le détail.</p>

<h2>4. Trouver des meubles</h2>
<p>NEXUS Market référence des meubles neufs et d'occasion dans la <a href="${origin}/categorie/maison">catégorie Maison &amp; Déco</a>, avec photos détaillées pour chaque annonce.</p>

<a class="cta" href="${origin}/categorie/maison">Voir les meubles disponibles →</a>
<p style="margin-top:1.4rem">Voir aussi : <a href="${origin}/blog">Tous les articles du blog</a> · <a href="${origin}/blog/louer-appartement-bureau-local-dakar">Louer un appartement à Dakar</a></p>`;

  return contentResponse(renderContentPage({
    origin, path: '/blog/acheter-meubles-senegal-neuf-occasion',
    title: 'Acheter des meubles au Sénégal : neuf vs occasion, livraison',
    description: 'Comment bien choisir entre meubles neufs et d\'occasion au Sénégal, et gérer la livraison des pièces volumineuses.',
    h1: 'Acheter des meubles au Sénégal : neuf vs occasion, livraison', crumbName: 'Blog — Meubles',
    isArticle: true, datePublished: '2026-08-19', bodyHtml: body, extraGraph: [faq],
  }));
}
