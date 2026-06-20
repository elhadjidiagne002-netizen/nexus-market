// functions/guides.js → /guides — sommaire éditorial (hub des guides).
import { renderContentPage, contentResponse } from './_lib/contentpage.js';

export async function onRequest({ request, env }) {
  const origin = env.SITE_URL || new URL(request.url).origin;
  const guides = [
    ['/guide/acheter-en-ligne-au-senegal', '🛍️ Acheter en ligne au Sénégal en toute sécurité', 'Le guide complet pour commander sans se faire arnaquer : protection acheteur, paiement, vérifications avant achat.'],
    ['/guide/vendre-sur-nexus-market', '🏪 Vendre sur NEXUS Market', 'De l’annonce express à la boutique pro : créer ses fiches, fixer ses prix, recevoir ses paiements et fidéliser.'],
    ['/guide/paiement-mobile-money', '💳 Payer avec Orange Money & Wave', 'Comment fonctionnent les paiements mobiles au Sénégal, leurs frais, leur sécurité et la garantie acheteur.'],
    ['/guide/livraison-au-senegal', '🚚 La livraison au Sénégal', 'Délais, tarifs, suivi, coursier à la demande et bonnes pratiques pour Dakar et les régions.'],
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
