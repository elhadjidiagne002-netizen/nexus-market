// functions/guide/livraison-au-senegal.js → /guide/livraison-au-senegal
import { renderContentPage, contentResponse } from '../_lib/contentpage.js';

export async function onRequest({ request, env }) {
  const origin = env.SITE_URL || new URL(request.url).origin;
  const faq = {
    '@type': 'FAQPage',
    mainEntity: [
      { '@type': 'Question', name: 'NEXUS livre-t-il dans toutes les régions du Sénégal ?', acceptedAnswer: { '@type': 'Answer', text: 'Oui, la livraison est possible partout au Sénégal — Dakar, Thiès, Saint-Louis, Touba, Ziguinchor et toutes les régions. Les délais et frais dépendent du vendeur et de votre localité.' } },
      { '@type': 'Question', name: 'Comment suivre ma commande ?', acceptedAnswer: { '@type': 'Answer', text: 'Chaque commande dispose d’un suivi de statut (en préparation, en transit, livrée) depuis votre tableau de bord, avec notifications. Pour le coursier à la demande à Dakar, le suivi est géolocalisé.' } },
    ],
  };
  const body = `
<h1>La livraison au Sénégal : délais, tarifs et bonnes pratiques</h1>
<p class="lead">Bien livré, bien vendu. La logistique est un facteur clé du e-commerce au Sénégal. Entre Dakar et les régions, voici comment fonctionne la livraison sur NEXUS Market, et nos conseils pour la réussir des deux côtés.</p>

<div class="tldr">
<h2>À retenir</h2>
<ul>
  <li>3 modes : <strong>domicile</strong>, <strong>retrait</strong>, ou <strong>coursier à la demande</strong> (Dakar, géolocalisé).</li>
  <li>Dakar : souvent le jour même ou sous 24–48 h. Régions : prévoir davantage.</li>
  <li>Donnez un <strong>point de repère clair</strong> + un numéro WhatsApp : c’est la clé d’une livraison rapide.</li>
  <li>Vérifiez le colis, puis <strong>confirmez la réception</strong> (cela débloque le paiement au vendeur).</li>
</ul>
</div>

<h2>1. Les modes de livraison disponibles</h2>
<ul>
  <li><strong>Livraison à domicile</strong> : le vendeur ou son livreur apporte la commande à votre adresse.</li>
  <li><strong>Retrait</strong> : vous récupérez le produit à un point convenu — pratique pour les objets volumineux.</li>
  <li><strong>Coursier à la demande (Dakar)</strong> : un livreur NEXUS prend en charge la course, avec suivi géolocalisé en temps réel.</li>
</ul>

<h2>2. Délais : à quoi s’attendre</h2>
<p>Le délai exact est toujours indiqué par le vendeur sur la fiche produit avant l’achat. À titre indicatif :</p>
<table>
<thead><tr><th>Zone</th><th>Délai indicatif</th><th>Mode conseillé</th></tr></thead>
<tbody>
  <tr><td>Dakar & proche banlieue</td><td>Jour même → 24 h</td><td>Coursier à la demande</td></tr>
  <tr><td>Grande banlieue (Rufisque, Keur Massar…)</td><td>24 → 48 h</td><td>Domicile / coursier</td></tr>
  <tr><td>Villes régionales (Thiès, Mbour, Saint-Louis…)</td><td>2 → 4 jours</td><td>Transporteur / domicile</td></tr>
  <tr><td>Zones éloignées (Casamance, est du pays…)</td><td>3 → 7 jours</td><td>Transporteur / retrait</td></tr>
</tbody>
</table>
<p>Ces durées sont des ordres de grandeur : elles varient selon le transporteur, la disponibilité du produit et la période (les pics comme la Tabaski rallongent les délais).</p>

<h2>3. Le défi de l’adressage</h2>
<div class="box">
<p>Au Sénégal, beaucoup de lieux n’ont pas d’adresse postale précise. Pour une livraison sans accroc, indiquez toujours un <strong>point de repère clair</strong> (« en face de la mosquée X », « à côté de la pharmacie Y »), votre <strong>quartier</strong> et un <strong>numéro de téléphone joignable</strong> (de préférence WhatsApp). Un bon repère, c’est une livraison plus rapide et moins d’allers-retours.</p>
</div>

<h2>4. Tarifs de livraison</h2>
<p>Les frais dépendent de la distance, du poids/volume et du mode choisi. Ils sont affichés avant la validation de la commande — pas de surprise au moment de payer. Pour le coursier à la demande, le tarif est calculé selon la course.</p>

<h2>5. Suivi et réception</h2>
<p>Vous suivez l’état de votre commande (en préparation, en transit, livrée) depuis votre tableau de bord, avec des notifications à chaque étape. À la réception, <strong>vérifiez le colis</strong> puis confirmez la livraison : c’est cette confirmation qui débloque le paiement vers le vendeur (voir la <a href="${origin}/guide/acheter-en-ligne-au-senegal">protection acheteur</a>).</p>

<h2>6. Conseils aux vendeurs</h2>
<ul>
  <li><strong>Emballez soigneusement</strong> : un produit qui arrive intact, c’est un avis positif.</li>
  <li><strong>Annoncez un délai réaliste</strong> et tenez-le.</li>
  <li><strong>Communiquez</strong> le suivi à l’acheteur ; prévenez en cas de retard.</li>
  <li><strong>Proposez plusieurs options</strong> (domicile, retrait) pour s’adapter à chacun.</li>
</ul>

<h2>7. Devenir livreur NEXUS</h2>
<p>La livraison crée aussi des opportunités de revenus. Vous avez une moto et connaissez Dakar ? Vous pouvez devenir <strong>coursier NEXUS</strong>, accepter des courses près de vous et être payé via Orange Money ou Wave.</p>

<a class="cta" href="${origin}/?register=courier">Devenir livreur / coursier →</a>
<p style="margin-top:1.4rem">Voir aussi : <a href="${origin}/guide/vendre-sur-nexus-market">Vendre sur NEXUS</a> · <a href="${origin}/faq">FAQ</a></p>`;

  return contentResponse(renderContentPage({
    origin, path: '/guide/livraison-au-senegal',
    title: 'La livraison au Sénégal : délais, tarifs & conseils — guide',
    description: 'Tout sur la livraison au Sénégal : modes (domicile, retrait, coursier Dakar), délais, tarifs, adressage, suivi et bonnes pratiques pour acheteurs et vendeurs.',
    h1: 'La livraison au Sénégal', crumbName: 'Guide — Livraison',
    isArticle: true, bodyHtml: body, extraGraph: [faq],
  }));
}
