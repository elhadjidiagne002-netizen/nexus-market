// functions/guide/comprendre-frais-livraison-dakar.js → /guide/comprendre-frais-livraison-dakar
import { renderContentPage, contentResponse } from '../_lib/contentpage.js';

export async function onRequest({ request, env }) {
  const origin = env.SITE_URL || new URL(request.url).origin;
  const faq = {
    '@type': 'FAQPage',
    mainEntity: [
      { '@type': 'Question', name: 'Combien coûte la livraison à Dakar ?', acceptedAnswer: { '@type': 'Answer', text: 'La livraison express par coursier dans Dakar coûte généralement entre 1 000 et 3 000 FCFA selon la distance et la taille du colis. Certains vendeurs offrent la livraison gratuite à partir d\'un montant minimum (souvent 15 000 à 20 000 FCFA). Pour les quartiers périphériques (Pikine, Guédiawaye, Rufisque), comptez 500 à 1 000 FCFA de plus.' } },
      { '@type': 'Question', name: 'Peut-on se faire livrer dans les régions hors Dakar ?', acceptedAnswer: { '@type': 'Answer', text: 'Oui, via des transporteurs inter-urbains (GIG Logistics, Senpost, DHL pour l\'international). Les délais sont de 1 à 3 jours pour les grandes villes de région (Thiès, Saint-Louis, Ziguinchor, Kaolack) et les tarifs varient entre 3 000 et 8 000 FCFA selon le poids et la destination.' } },
      { '@type': 'Question', name: 'Que faire si mon colis est perdu ou abîmé ?', acceptedAnswer: { '@type': 'Answer', text: 'Contactez immédiatement le vendeur et la plateforme. Sur NEXUS Market, vous disposez d\'un délai pour signaler un problème après livraison. Le paiement est maintenu en séquestre jusqu\'à votre confirmation de réception — si le colis est perdu ou endommagé, vous pouvez ouvrir un litige et obtenir un remboursement ou un renvoi.' } },
    ],
  };
  const body = `
<h1>Comprendre les frais de livraison à Dakar et au Sénégal</h1>
<p class="lead">La livraison est souvent la partie la plus floue d'une commande en ligne. Délais, tarifs, zones couvertes, que faire en cas de problème… Ce guide décrypte tout ce qu'il faut savoir avant de passer commande ou de proposer la livraison en tant que vendeur.</p>

<div class="tldr">
<h2>À retenir</h2>
<ul>
  <li>Livraison dans Dakar : <strong>1 000 à 3 000 FCFA</strong>, en général le jour même ou le lendemain.</li>
  <li>Régions : <strong>3 000 à 8 000 FCFA</strong>, 1 à 3 jours selon la destination.</li>
  <li>Vérifiez si la <strong>livraison est incluse</strong> dans le prix ou ajoutée au moment du paiement.</li>
  <li>Un numéro de <strong>suivi</strong> est indispensable pour les commandes de valeur.</li>
</ul>
</div>

<h2>1. Les différents modes de livraison disponibles</h2>
<p>Selon le vendeur et l'article, plusieurs options existent :</p>
<ul>
  <li><strong>Coursier à la demande</strong> (ex. NEXUS Coursier) : livraison express dans Dakar, souvent dans la journée. Idéal pour les articles fragiles ou urgents — vous suivez le coursier en temps réel.</li>
  <li><strong>Livraison standard par transporteur</strong> : pour les colis plus volumineux ou les expéditions en régions. Plus économique, délai de 1 à 3 jours.</li>
  <li><strong>Retrait chez le vendeur</strong> : la solution gratuite, idéale si vous êtes dans la même zone. Vous inspectez l'article avant de payer.</li>
  <li><strong>Remise en point relais</strong> : certains vendeurs proposent de déposer le colis dans un point de collecte, pratique si vous avez des horaires décalés.</li>
</ul>

<h2>2. Les tarifs selon la zone</h2>
<div class="box">
<p><strong>Dakar centre</strong> (Plateau, Médina, Almadies, Fann) : 1 000 à 1 500 FCFA. <strong>Banlieue</strong> (Pikine, Guédiawaye, Parcelles, Thiaroye) : 1 500 à 2 500 FCFA. <strong>Rufisque et périphérie éloignée</strong> : 2 000 à 3 000 FCFA. <strong>Thiès, Saint-Louis, Kaolack, Ziguinchor</strong> : 3 000 à 6 000 FCFA. <strong>Autres régions</strong> : 5 000 à 8 000 FCFA. Ces tarifs sont indicatifs et peuvent varier selon le poids, le volume et le service choisi.</p>
</div>

<h2>3. Ce qu'un acheteur doit vérifier</h2>
<p>Avant de valider une commande, lisez attentivement : les <strong>frais de livraison sont-ils inclus ou en supplément</strong> ? Y a-t-il un <strong>minimum de commande</strong> pour la livraison gratuite ? Quel est le <strong>délai estimé</strong> ? Recevrez-vous un <strong>numéro de suivi</strong> ? Ces informations doivent être claires dans la fiche produit ou le récapitulatif de commande — si elles ne le sont pas, demandez avant de payer.</p>

<h2>4. Conseils pour les vendeurs</h2>
<p>Proposer des frais de livraison clairs augmente le taux de conversion. Affichez les tarifs par zone directement dans votre boutique. Si vous utilisez un coursier partenaire, communiquez le délai moyen et le numéro de suivi dès l'expédition. Emballez soigneusement (prenez une photo du colis fermé avant envoi) et respectez les délais annoncés : c'est ce qui vous vaut de bons avis et des clients fidèles.</p>

<h2>5. En cas de problème de livraison</h2>
<p>Colis en retard, perdu ou abîmé : contactez d'abord le vendeur. Sur NEXUS Market, le paiement reste en séquestre jusqu'à votre confirmation de réception. Si le colis n'arrive pas dans le délai prévu ou ne correspond pas à l'annonce, ouvrez un <strong>litige via la plateforme</strong> — notre équipe intervient pour trouver une solution. Pour les remboursements, le délai est en général de 2 à 5 jours ouvrables selon le mode de paiement.</p>

<a class="cta" href="${origin}/">Commander sur NEXUS Market →</a>
<p style="margin-top:1.4rem">Voir aussi : <a href="${origin}/guide/livraison-au-senegal">La livraison au Sénégal</a> · <a href="${origin}/guide/acheter-en-ligne-au-senegal">Acheter en ligne en sécurité</a></p>`;

  return contentResponse(renderContentPage({
    origin, path: '/guide/comprendre-frais-livraison-dakar',
    title: 'Frais de livraison à Dakar et au Sénégal : guide complet 2026',
    description: 'Tarifs de livraison à Dakar et en régions, délais, modes disponibles, que faire en cas de colis perdu. Tout ce qu\'acheteurs et vendeurs doivent savoir sur la livraison au Sénégal.',
    h1: 'Comprendre les frais de livraison à Dakar', crumbName: 'Guide — Livraison à Dakar',
    isArticle: true, bodyHtml: body, extraGraph: [faq],
  }));
}
