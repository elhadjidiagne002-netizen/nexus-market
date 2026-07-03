// functions/guides.js → /guides — sommaire éditorial (hub des guides).
import { renderContentPage, contentResponse } from './_lib/contentpage.js';

export async function onRequest({ request, env }) {
  const origin = env.SITE_URL || new URL(request.url).origin;
  const guides = [
    ['/guide/acheter-en-ligne-au-senegal', '🛍️ Acheter en ligne au Sénégal en toute sécurité', 'Le guide complet pour commander sans se faire arnaquer : protection acheteur, paiement, vérifications avant achat.'],
    ['/guide/vendre-sur-nexus-market', '🏪 Vendre sur NEXUS Market', 'De l’annonce express à la boutique pro : créer ses fiches, fixer ses prix, recevoir ses paiements et fidéliser.'],
    ['/guide/paiement-mobile-money', '💳 Payer avec Orange Money & Wave', 'Comment fonctionnent les paiements mobiles au Sénégal, leurs frais, leur sécurité et la garantie acheteur.'],
    ['/guide/livraison-au-senegal', '🚚 La livraison au Sénégal', 'Délais, tarifs, suivi, coursier à la demande et bonnes pratiques pour Dakar et les régions.'],
    ['/guide/acheter-mouton-tabaski-senegal', '🐏 Acheter un mouton de Tabaski', 'Quand acheter, comment choisir un mouton sain, négocier le prix et trouver un éleveur de confiance près de chez vous.'],
    ['/guide/vendre-telephone-occasion-senegal', '📱 Vendre son téléphone d’occasion', 'Préparer l’appareil, fixer le prix, rédiger l’annonce et vendre sans arnaque grâce au paiement sécurisé.'],
    ['/guide/devenir-coursier-livreur-dakar', '🛵 Devenir coursier / livreur à Dakar', 'Prérequis, fonctionnement des courses géolocalisées, revenus et conseils pour livrer et gagner de l’argent.'],
    ['/guide/troc-echanger-objets-senegal', '🔄 Le troc : échanger sans argent', 'Échangez vos objets en bon état, évaluez un troc équilibré et sécurisez la remise.'],
    ['/guide/produits-locaux-terroir-senegal', '🇸🇳 Produits locaux & du terroir', 'Consommer sénégalais : pourquoi, quels produits, et comment trouver les producteurs proches.'],
    ['/guide/orange-money-vs-wave-senegal', '⚖️ Orange Money ou Wave : lequel choisir ?', 'Comparatif clair des deux services de paiement mobile : frais, couverture, sécurité et lequel prendre selon votre usage.'],
    ['/guide/acheter-smartphone-occasion-senegal', '📲 Acheter un smartphone d’occasion', 'Vérifier l’IMEI, tester la batterie et l’écran, éviter les téléphones bloqués et payer en sécurité.'],
    ['/guide/reussir-annonce-photos-prix-senegal', '✨ Réussir son annonce : photos & prix', 'Des photos qui inspirent confiance, un prix réaliste et une description honnête pour vendre vite.'],
    ['/guide/eviter-arnaques-achats-en-ligne-senegal', '🛡️ Éviter les arnaques en ligne', 'Reconnaître une annonce frauduleuse, les réflexes de paiement sécurisé et que faire si on est victime d\'une arnaque.'],
    ['/guide/vendre-artisanat-mode-senegal', '🎨 Vendre son artisanat et sa mode africaine', 'Boubous, bijoux, wax : comment photographier, fixer le prix, gérer les commandes sur mesure et expédier sans casse.'],
    ['/guide/comprendre-frais-livraison-dakar', '📦 Frais de livraison à Dakar et au Sénégal', 'Tarifs par zone, délais, modes disponibles et quoi faire si le colis est perdu ou abîmé.'],
  ];
  const body = `
<h1>Guides NEXUS Market</h1>
<p class="lead">Nos guides pratiques pour acheter, vendre, payer et se faire livrer en ligne au Sénégal, en toute confiance. Des conseils concrets, adaptés au contexte sénégalais (Orange Money, Wave, livraison à Dakar et en régions).</p>
<div class="cards">
${guides.map(([h, t, d]) => `<a class="card" href="${origin + h}"><h3>${t}</h3><p>${d}</p></a>`).join('')}
</div>
<h2>À qui s’adressent ces guides ?</h2>
<p>Que vous soyez un <strong>acheteur</strong> qui passe sa première commande, un <strong>vendeur</strong> qui lance sa boutique, un <strong>artisan</strong> ou un <strong>éleveur</strong> qui cherche de nouveaux clients, vous trouverez ici l’essentiel pour démarrer sereinement. NEXUS Market est pensé pour le commerce de proximité sénégalais : paiement mobile, contact direct, livraison locale et protection des deux parties.</p>
<a class="cta" href="${origin}/">Explorer la marketplace →</a>`;

  return contentResponse(renderContentPage({
    origin, path: '/guides',
    title: 'Guides pratiques — acheter, vendre & se faire livrer au Sénégal',
    description: 'Tous les guides NEXUS Market : acheter en ligne en sécurité, vendre, payer avec Orange Money & Wave, et la livraison au Sénégal.',
    h1: 'Guides NEXUS Market', crumbName: 'Guides', isArticle: false, bodyHtml: body,
  }));
}
