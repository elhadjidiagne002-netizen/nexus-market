// functions/blog/comment-fixer-prix-revente-objet-occasion.js
import { renderContentPage, contentResponse } from '../_lib/contentpage.js';

export async function onRequest({ request, env }) {
  const origin = env.SITE_URL || new URL(request.url).origin;
  const faq = {
    '@type': 'FAQPage',
    mainEntity: [
      { '@type': 'Question', name: 'Comment savoir si mon prix est trop élevé ?', acceptedAnswer: { '@type': 'Answer', text: 'Si votre annonce reste sans message après plusieurs jours alors que des articles similaires se vendent, c\'est souvent le signe qu\'il faut ajuster le prix à la baisse.' } },
      { '@type': 'Question', name: 'Faut-il toujours accepter de négocier ?', acceptedAnswer: { '@type': 'Answer', text: 'Non, mais fixer un prix légèrement au-dessus de votre minimum acceptable laisse une marge de négociation naturelle, appréciée par les acheteurs sénégalais.' } },
    ],
  };
  const body = `
<h1>Comment fixer le juste prix d'un objet d'occasion</h1>
<p class="lead">Un prix trop élevé fait fuir les acheteurs, un prix trop bas vous fait perdre de l'argent. Voici une méthode simple pour évaluer correctement ce que vous vendez, que ce soit un meuble, un vêtement ou un appareil électronique.</p>

<div class="tldr">
<h2>À retenir</h2>
<ul>
  <li>Comparez toujours avec des annonces similaires déjà publiées avant de fixer votre prix.</li>
  <li>L'état réel de l'objet (pas son état supposé) doit dicter la décote par rapport au neuf.</li>
  <li>Un prix légèrement au-dessus de votre minimum laisse une marge de négociation.</li>
</ul>
</div>

<h2>1. Partir du prix du neuf</h2>
<p>Pour tout objet, la première référence est son prix d'achat neuf (ou le prix actuel d'un modèle équivalent neuf). C'est le plafond absolu : un article d'occasion ne devrait jamais dépasser ce prix, sauf cas très rare (objet de collection, rareté).</p>

<h2>2. Appliquer une décote selon l'état et l'âge</h2>
<table>
<thead><tr><th>État de l'objet</th><th>Décote indicative vs le neuf</th></tr></thead>
<tbody>
<tr><td>Comme neuf, jamais/peu utilisé</td><td>10-20%</td></tr>
<tr><td>Bon état, traces d'usage normales</td><td>30-50%</td></tr>
<tr><td>État moyen, défauts visibles</td><td>50-70%</td></tr>
<tr><td>Fonctionnel mais très usé</td><td>70-85%</td></tr>
</tbody>
</table>
<p>Ces pourcentages sont indicatifs : un smartphone perd généralement de la valeur plus vite qu'un meuble en bois massif, par exemple. Adaptez selon la catégorie.</p>

<h2>3. Comparer avec des annonces similaires</h2>
<p>Avant de publier, prenez cinq minutes pour regarder les prix d'articles comparables déjà en ligne (même catégorie, état proche). C'est le moyen le plus fiable de fixer un prix réaliste pour le marché sénégalais actuel, plutôt que de se baser uniquement sur un calcul théorique.</p>

<h2>4. Laisser une marge de négociation</h2>
<p>La négociation fait partie des habitudes d'achat au Sénégal. Fixer un prix 5 à 10% au-dessus de votre minimum acceptable permet de répondre positivement à une contre-offre sans perdre sur l'affaire.</p>

<h2>5. Des cas particuliers à connaître</h2>
<ul>
  <li><strong>Téléphones</strong> : l'état de la batterie et l'IMEI comptent autant que l'aspect extérieur — voir notre guide <a href="${origin}/guide/vendre-telephone-occasion-senegal">vendre son téléphone d'occasion</a>.</li>
  <li><strong>Véhicules</strong> : le kilométrage et l'historique d'entretien pèsent plus que l'année du modèle.</li>
  <li><strong>Mode et artisanat</strong> : une pièce unique ou faite main peut se négocier différemment d'un vêtement de série — voir <a href="${origin}/guide/vendre-artisanat-mode-senegal">vendre son artisanat et sa mode</a>.</li>
</ul>

<div class="box">
<p>Envie de rédiger une annonce qui donne confiance et se vend vite ? Notre guide <a href="${origin}/guide/reussir-annonce-photos-prix-senegal">réussir son annonce : photos & prix</a> complète parfaitement cette méthode de tarification.</p>
</div>

<a class="cta" href="${origin}/?register=vendor">Publier mon annonce →</a>
<p style="margin-top:1.4rem">Voir aussi : <a href="${origin}/blog">Tous les articles du blog</a> · <a href="${origin}/guides">Tous les guides</a></p>`;

  return contentResponse(renderContentPage({
    origin, path: '/blog/comment-fixer-prix-revente-objet-occasion',
    title: 'Comment fixer le juste prix d\'un objet d\'occasion',
    description: 'Méthode simple pour évaluer et fixer le bon prix de revente d\'un objet d\'occasion au Sénégal : décote selon l\'état, comparaison du marché, marge de négociation.',
    h1: 'Comment fixer le juste prix d\'un objet d\'occasion', crumbName: 'Blog — Prix de revente',
    isArticle: true, datePublished: '2026-07-06', bodyHtml: body, extraGraph: [faq],
  }));
}
