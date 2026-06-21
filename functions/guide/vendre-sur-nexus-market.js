// functions/guide/vendre-sur-nexus-market.js → /guide/vendre-sur-nexus-market
import { renderContentPage, contentResponse } from '../_lib/contentpage.js';

export async function onRequest({ request, env }) {
  const origin = env.SITE_URL || new URL(request.url).origin;
  const faq = {
    '@type': 'FAQPage',
    mainEntity: [
      { '@type': 'Question', name: 'Faut-il un registre de commerce pour vendre ?', acceptedAnswer: { '@type': 'Answer', text: 'Non pour publier une annonce express en tant que particulier. Pour ouvrir une boutique vendeur professionnelle, un NINEA et un registre de commerce (RC) sont demandés afin de fiabiliser la marketplace et de rassurer les acheteurs.' } },
      { '@type': 'Question', name: 'Quels sont les frais pour vendre ?', acceptedAnswer: { '@type': 'Answer', text: 'La publication est gratuite. NEXUS prélève une commission uniquement sur les ventes effectivement conclues via la plateforme, réduite pour les vendeurs parrainés. Aucun abonnement obligatoire ni frais caché.' } },
    ],
  };
  const body = `
<h1>Vendre sur NEXUS Market : le guide du vendeur</h1>
<p class="lead">Vous avez des produits à vendre, un stock à écouler ou une boutique physique à digitaliser ? NEXUS Market vous permet de toucher des milliers d’acheteurs au Sénégal, d’encaisser via Orange Money, Wave ou carte, et de tout piloter depuis un tableau de bord. Voici comment réussir vos ventes.</p>

<div class="tldr">
<h2>À retenir</h2>
<ul>
  <li><strong>Annonce express</strong> (sans compte, en 2 min) ou <strong>boutique vendeur</strong> (gestion complète).</li>
  <li>Une <strong>fiche soignée</strong> (photos nettes + description honnête + bon prix) vend beaucoup plus vite.</li>
  <li>Vous êtes payé sur Orange Money / Wave <strong>après confirmation</strong> de la livraison.</li>
  <li>Publication gratuite ; commission uniquement sur les ventes conclues.</li>
</ul>
</div>

<h2>1. Annonce express ou boutique vendeur ?</h2>
<p>Deux façons de vendre, selon votre besoin :</p>
<ul>
  <li><strong>L’annonce express</strong> : publiez un produit en 2 minutes, même sans créer de compte. Idéal pour vendre un objet ponctuellement (téléphone d’occasion, meuble, vêtement).</li>
  <li><strong>La boutique vendeur</strong> : un véritable espace professionnel avec gestion des produits, des commandes, des stocks, des paiements et des statistiques. Idéal si vous vendez régulièrement.</li>
</ul>

<h2>2. Rédiger une fiche produit qui vend</h2>
<p>La qualité de votre fiche fait toute la différence :</p>
<ul>
  <li><strong>Photos nettes et lumineuses</strong>, sous plusieurs angles, sur fond neutre. La première photo est décisive.</li>
  <li><strong>Titre clair</strong> : marque, modèle, état (neuf / occasion), caractéristique clé.</li>
  <li><strong>Description honnête et complète</strong> : dimensions, couleur, défauts éventuels, contenu de la boîte. Un acheteur rassuré achète plus vite.</li>
  <li><strong>Catégorie exacte</strong> pour être trouvé dans les recherches.</li>
</ul>

<h2>3. Fixer le bon prix</h2>
<p>Comparez les produits similaires déjà en ligne. Un prix réaliste se vend ; un prix trop élevé fait fuir, un prix trop bas inquiète. Pensez à intégrer la commission et, si besoin, les frais de livraison. Vous pouvez aussi accepter les <strong>offres</strong> des acheteurs pour négocier, comme au marché.</p>

<h2>4. Recevoir ses paiements en toute sécurité</h2>
<div class="box">
<p>Les paiements des acheteurs sont sécurisés par la plateforme et vous sont reversés sur <strong>Orange Money</strong>, <strong>Wave</strong> ou par virement, après confirmation de la livraison. Vous suivez vos gains et demandez vos retraits depuis votre tableau de bord. Ce mécanisme protège aussi le vendeur : l’acheteur a réellement payé avant l’expédition.</p>
</div>

<h2>5. Gérer commandes et livraison</h2>
<p>À chaque commande, vous recevez une notification. Préparez le colis, choisissez le mode de livraison (votre propre livreur, le retrait, ou le coursier à la demande), puis mettez à jour le statut. Une livraison rapide et un bon emballage génèrent des avis positifs — donc plus de ventes futures.</p>

<h2>6. Développer ses ventes</h2>
<ul>
  <li><strong>Soignez vos avis</strong> : un vendeur bien noté inspire confiance.</li>
  <li><strong>Boostez vos annonces</strong> pour apparaître en tête de catégorie aux moments forts.</li>
  <li><strong>Publiez des NEXUS Stories</strong> (vidéos produit) pour montrer vos articles en situation.</li>
  <li><strong>Parrainez d’autres vendeurs</strong> et profitez du programme ambassadeur.</li>
</ul>

<h2>7. Cas particuliers : artisans et éleveurs</h2>
<p>Vous êtes un professionnel des services (maçon, plombier, électricien…) ? Créez votre profil sur <a href="${origin}/devenir-pro">NEXUS Pro</a> pour être trouvé par les clients proches. Vous êtes éleveur ou producteur local ? Activez votre profil sur <a href="${origin}/devenir-eleveur">NEXUS Élevage</a>.</p>

<a class="cta gold" href="${origin}/?register=vendor">Ouvrir ma boutique vendeur →</a>
<p style="margin-top:1.4rem">Voir aussi : <a href="${origin}/guide/paiement-mobile-money">Paiement Orange Money & Wave</a> · <a href="${origin}/guide/livraison-au-senegal">La livraison au Sénégal</a></p>`;

  return contentResponse(renderContentPage({
    origin, path: '/guide/vendre-sur-nexus-market',
    title: 'Vendre sur NEXUS Market au Sénégal — guide du vendeur',
    description: 'Comment vendre en ligne au Sénégal : annonce express ou boutique, fiches produit, prix, paiements Orange Money/Wave, livraison et croissance des ventes.',
    h1: 'Vendre sur NEXUS Market', crumbName: 'Guide — Vendre',
    isArticle: true, bodyHtml: body, extraGraph: [faq],
  }));
}
