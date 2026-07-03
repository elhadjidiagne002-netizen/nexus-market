// functions/guide/reussir-annonce-photos-prix-senegal.js → /guide/reussir-annonce-photos-prix-senegal
import { renderContentPage, contentResponse } from '../_lib/contentpage.js';

export async function onRequest({ request, env }) {
  const origin = env.SITE_URL || new URL(request.url).origin;
  const faq = {
    '@type': 'FAQPage',
    mainEntity: [
      { '@type': 'Question', name: 'Combien de photos faut-il mettre dans une annonce ?', acceptedAnswer: { '@type': 'Answer', text: 'Au moins 3 à 5 photos nettes : une vue d’ensemble, des gros plans, l’étiquette ou la marque, et les éventuels défauts. Plus l’acheteur voit, plus il a confiance et plus vite vous vendez.' } },
      { '@type': 'Question', name: 'Comment fixer le bon prix ?', acceptedAnswer: { '@type': 'Answer', text: 'Regardez les prix des articles similaires déjà en vente, tenez compte de l’état et de l’ancienneté, puis positionnez-vous juste en dessous du marché si vous voulez vendre vite. Un prix réaliste vend plus vite qu’un prix « au feeling ».' } },
      { '@type': 'Question', name: 'Faut-il indiquer les défauts du produit ?', acceptedAnswer: { '@type': 'Answer', text: 'Oui, toujours. Annoncer honnêtement une rayure ou une usure évite les litiges, rassure l’acheteur et accélère la vente. Une description transparente = moins de retours et de meilleurs avis.' } },
    ],
  };
  const body = `
<h1>Réussir son annonce : des photos et un prix qui vendent</h1>
<p class="lead">Deux annonces pour le même article peuvent se vendre en un jour… ou rester en ligne un mois. La différence tient à trois choses : les photos, le prix et la description. Voici la méthode simple pour vendre vite et au bon prix sur NEXUS Market.</p>

<div class="tldr">
<h2>À retenir</h2>
<ul>
  <li><strong>3 à 5 photos nettes</strong>, à la lumière du jour, sur fond neutre.</li>
  <li>Un <strong>prix réaliste</strong>, calé sur le marché, vend bien plus vite.</li>
  <li>Un <strong>titre précis</strong> (marque + modèle + état) et une description honnête.</li>
  <li>Répondez <strong>vite</strong> aux messages : la première réponse fait souvent la vente.</li>
</ul>
</div>

<h2>1. Des photos qui inspirent confiance</h2>
<p>La photo est votre vitrine. Sur un marché en ligne, l’acheteur ne peut ni toucher ni essayer : il achète ce qu’il voit. Quelques règles font toute la différence :</p>
<ol>
  <li><strong>Lumière du jour</strong> : photographiez près d’une fenêtre, évitez le flash et la pénombre.</li>
  <li><strong>Fond neutre et propre</strong> : posez l’objet sur une surface unie, sans désordre autour.</li>
  <li><strong>Plusieurs angles</strong> : une vue d’ensemble, des gros plans, l’étiquette/la marque, et les défauts éventuels.</li>
  <li><strong>Nettoyez l’objet</strong> avant la photo : un article propre paraît plus cher et plus fiable.</li>
  <li><strong>Pas de photo « prise sur Internet »</strong> : montrez VOTRE article réel — c’est ce qui rassure et évite les litiges.</li>
</ol>

<h2>2. Fixer le juste prix</h2>
<div class="box">
<p>Le prix est le premier filtre de l’acheteur. Trop haut, votre annonce est ignorée ; trop bas, vous perdez de l’argent. La bonne méthode : <strong>comparez</strong> les articles similaires déjà en vente, tenez compte de l’<strong>état</strong> et de l’<strong>ancienneté</strong>, puis fixez un prix <strong>juste en dessous</strong> du marché si vous voulez vendre rapidement. Indiquez si le prix est « ferme » ou « négociable » : cela cadre la discussion.</p>
</div>

<h2>3. Un titre et une description efficaces</h2>
<p>Le <strong>titre</strong> doit contenir l’essentiel : marque, modèle, taille ou capacité, état. « Samsung Galaxy A54 128 Go — très bon état » est bien meilleur que « téléphone à vendre ». Dans la <strong>description</strong>, donnez les informations qu’un acheteur cherche : caractéristiques, raison de la vente, accessoires inclus, et <strong>défauts éventuels sans les cacher</strong>. L’honnêteté vend : elle réduit les retours et vous vaut de bons avis.</p>

<h2>4. Répondre vite et bien</h2>
<p>Sur un marché, la réactivité fait la vente. Le premier vendeur qui répond avec des réponses claires emporte souvent l’achat. Restez courtois, donnez les infos demandées, et proposez un mode de remise pratique (livraison, coursier à Dakar, ou remise en main propre dans un lieu public).</p>

<h2>5. Sécuriser la transaction</h2>
<p>Passez par la plateforme pour être protégé, vous comme l’acheteur : le paiement est encaissé par NEXUS puis versé une fois la livraison confirmée. Cela évite les impayés et les arnaques « je t’envoie l’argent après ». Une transaction propre = un bon avis, et de meilleurs avis = des ventes plus rapides ensuite.</p>

<a class="cta" href="${origin}/?register=vendor">Déposer une annonce sur NEXUS →</a>
<p style="margin-top:1.4rem">Voir aussi : <a href="${origin}/guide/vendre-sur-nexus-market">Vendre sur NEXUS, mode d’emploi</a> · <a href="${origin}/guide/vendre-telephone-occasion-senegal">Vendre son téléphone d’occasion</a></p>`;

  return contentResponse(renderContentPage({
    origin, path: '/guide/reussir-annonce-photos-prix-senegal',
    title: 'Réussir son annonce : photos et prix qui vendent — guide vendeur',
    description: 'Vendre vite au Sénégal : réussir ses photos, fixer le bon prix, écrire un titre et une description efficaces, et sécuriser la transaction. Le guide vendeur NEXUS Market.',
    h1: 'Réussir son annonce', crumbName: 'Guide — Réussir son annonce',
    isArticle: true, bodyHtml: body, extraGraph: [faq],
  }));
}
