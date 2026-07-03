// functions/guide/vendre-artisanat-mode-senegal.js → /guide/vendre-artisanat-mode-senegal
import { renderContentPage, contentResponse } from '../_lib/contentpage.js';

export async function onRequest({ request, env }) {
  const origin = env.SITE_URL || new URL(request.url).origin;
  const faq = {
    '@type': 'FAQPage',
    mainEntity: [
      { '@type': 'Question', name: 'Peut-on vendre du tissu wax et des boubous en ligne au Sénégal ?', acceptedAnswer: { '@type': 'Answer', text: 'Oui, le prêt-à-porter africain se vend très bien en ligne, à condition de soigner les photos (port sur mannequin ou sur soi, lumière naturelle) et d\'indiquer clairement les mensurations et la composition du tissu. Les acheteurs de diaspora et de grandes villes représentent un marché important pour l\'artisanat textile sénégalais.' } },
      { '@type': 'Question', name: 'Comment fixer le prix de son artisanat ?', acceptedAnswer: { '@type': 'Answer', text: 'Calculez votre coût de revient (matières premières + temps de fabrication) et ajoutez une marge de 30 à 50 % au minimum. Comparez avec ce que proposent d\'autres artisans. Votre savoir-faire a de la valeur : ne bradez pas votre travail. Un prix trop bas nuit à votre image autant qu\'un prix trop haut.' } },
      { '@type': 'Question', name: 'Comment livrer de l\'artisanat sans casse ni perte ?', acceptedAnswer: { '@type': 'Answer', text: 'Emballez soigneusement : papier de soie pour les textiles, bulles ou mousse pour la poterie et la bijouterie. Prenez une photo du colis avant envoi — c\'est votre preuve d\'état. Utilisez un coursier avec suivi et, pour les objets fragiles ou de valeur, vérifiez si une assurance colis est proposée.' } },
    ],
  };
  const body = `
<h1>Vendre son artisanat et sa mode africaine en ligne au Sénégal</h1>
<p class="lead">Boubous, bijoux, sacs en cuir, poteries, batik, tissus wax… l'artisanat sénégalais attire de nombreux acheteurs en ligne, en ville comme dans la diaspora. Voici comment mettre en valeur votre savoir-faire et vendre sans intermédiaire, au juste prix.</p>

<div class="tldr">
<h2>À retenir</h2>
<ul>
  <li>Des <strong>photos portées</strong> (sur soi ou mannequin) vendent mieux que des photos à plat.</li>
  <li>Donnez les <strong>dimensions exactes</strong> et la composition du tissu — c'est ce que l'acheteur cherche en premier.</li>
  <li>Fixez un <strong>prix qui couvre votre temps</strong> de fabrication, pas seulement les matières.</li>
  <li>Emballez soigneusement et prenez une photo du colis avant envoi.</li>
</ul>
</div>

<h2>1. Mettre en valeur son produit avec les bonnes photos</h2>
<p>Pour l'artisanat et la mode, la photo fait toute la vente. Quelques règles qui changent tout :</p>
<ul>
  <li><strong>Photos portées</strong> : un boubou sur un cintre ne dit rien ; porté par une personne, il montre le tombé, les proportions, le rendu réel. C'est ce qui déclenche l'achat.</li>
  <li><strong>Lumière naturelle</strong> : placez-vous près d'une fenêtre, évitez le flash qui dénature les couleurs du wax et des broderies.</li>
  <li><strong>Détails</strong> : photographiez la couture, le tissu en gros plan, la broderie ou le bijou de près — l'acheteur en ligne touche avec les yeux.</li>
  <li><strong>Fond neutre</strong> : un mur blanc ou un tissu uni met en valeur sans distraire.</li>
</ul>

<h2>2. Rédiger une fiche produit complète</h2>
<div class="box">
<p>Pour les vêtements et textiles, précisez : <strong>taille et mensurations</strong> (tour de poitrine, longueur, largeur épaules), <strong>composition du tissu</strong> (100 % coton, bazin, wax hollandais…), <strong>entretien recommandé</strong> (lavage à la main, à l'ombre) et <strong>délai de confection</strong> si l'article est fait sur commande. Pour les bijoux : matière (argent, laiton, coquillage), dimensions, poids. Ces informations réduisent les questions et les retours.</p>
</div>

<h2>3. Fixer le juste prix</h2>
<p>Beaucoup d'artisans sous-évaluent leur travail. Calculez d'abord votre <strong>coût de revient</strong> : matières premières + votre temps de fabrication (valorisez votre heure honnêtement). Ajoutez une <strong>marge</strong> de 30 à 50 % minimum pour couvrir les imprévus, les retours et la commission plateforme. Comparez avec d'autres vendeurs, mais ne bradez pas : un prix trop bas signale un produit de moindre qualité aux yeux de l'acheteur.</p>

<h2>4. Gérer les commandes sur mesure</h2>
<p>L'artisanat se prête bien aux commandes personnalisées (couleur, taille, broderie). Soyez clair sur les conditions dès le départ : <strong>délai de réalisation</strong>, <strong>acompte demandé</strong> (en général 30 à 50 %) et <strong>politique de retour sur mesure</strong> (généralement non remboursable, sauf défaut de fabrication). Communiquez à chaque étape : une photo en cours de fabrication rassure l'acheteur et réduit les litiges à la livraison.</p>

<h2>5. Emballer et expédier sans casse</h2>
<p>L'emballage est votre dernière impression. Pour les textiles : papier de soie + sac kraft ou boîte, propre et soigné. Pour la bijouterie et la poterie : mousse de calage ou bulles + carton rigide. <strong>Prenez une photo du colis fermé avant l'envoi</strong> — c'est votre preuve en cas de litige. Utilisez un service avec numéro de suivi et proposez l'option « livraison par coursier » pour Dakar : c'est plus rapide et vous gardez le contrôle.</p>

<a class="cta" href="${origin}/?register=vendor">Ouvrir votre boutique artisanat sur NEXUS →</a>
<p style="margin-top:1.4rem">Voir aussi : <a href="${origin}/guide/vendre-sur-nexus-market">Vendre sur NEXUS, mode d'emploi</a> · <a href="${origin}/guide/reussir-annonce-photos-prix-senegal">Réussir son annonce (photos &amp; prix)</a></p>`;

  return contentResponse(renderContentPage({
    origin, path: '/guide/vendre-artisanat-mode-senegal',
    title: 'Vendre son artisanat et sa mode africaine en ligne au Sénégal',
    description: 'Comment vendre boubous, bijoux, wax et artisanat sénégalais en ligne : photos, fiche produit, prix juste, commandes sur mesure et expédition sécurisée.',
    h1: 'Vendre son artisanat et sa mode en ligne', crumbName: 'Guide — Artisanat & mode',
    isArticle: true, bodyHtml: body, extraGraph: [faq],
  }));
}
