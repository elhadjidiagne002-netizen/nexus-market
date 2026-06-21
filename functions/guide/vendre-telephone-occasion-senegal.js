// functions/guide/vendre-telephone-occasion-senegal.js → /guide/vendre-telephone-occasion-senegal
import { renderContentPage, contentResponse } from '../_lib/contentpage.js';

export async function onRequest({ request, env }) {
  const origin = env.SITE_URL || new URL(request.url).origin;
  const faq = {
    '@type': 'FAQPage',
    mainEntity: [
      { '@type': 'Question', name: 'Comment fixer le prix d’un téléphone d’occasion ?', acceptedAnswer: { '@type': 'Answer', text: 'Partez du prix du neuf, puis appliquez une décote selon l’âge, l’état, la capacité de stockage et la présence des accessoires/facture. Comparez les annonces similaires en ligne pour vous caler sur le marché.' } },
      { '@type': 'Question', name: 'Comment éviter les arnaques en vendant mon téléphone ?', acceptedAnswer: { '@type': 'Answer', text: 'Passez par une plateforme avec paiement sécurisé plutôt que par un transfert direct. Sur NEXUS, l’acheteur paie via la plateforme et l’argent vous est reversé après confirmation — vous évitez les faux reçus de paiement.' } },
    ],
  };
  const body = `
<h1>Vendre son téléphone d’occasion au Sénégal</h1>
<p class="lead">Changer de téléphone ? Plutôt que de le laisser dormir dans un tiroir, revendez-le. Un smartphone d’occasion en bon état se vend vite au Sénégal. Voici comment en tirer le meilleur prix, en toute sécurité.</p>

<div class="tldr">
<h2>À retenir</h2>
<ul>
  <li><strong>Avant de vendre</strong> : sauvegardez, réinitialisez, et <strong>déconnectez vos comptes</strong> (iCloud/Google).</li>
  <li>Le prix dépend du modèle, du stockage, de l’état, de la batterie et des accessoires/facture.</li>
  <li>Photos <strong>réelles</strong> de votre appareil + état honnête = vente plus rapide.</li>
  <li>Encaissez via le <strong>paiement sécurisé</strong> de la plateforme (évitez les faux reçus Wave/OM).</li>
</ul>
</div>

<h2>1. Préparer le téléphone avant la vente</h2>
<ul>
  <li><strong>Sauvegardez vos données</strong> (photos, contacts) puis faites une <strong>réinitialisation d’usine</strong>.</li>
  <li><strong>Déconnectez vos comptes</strong> (compte Google / iCloud) — sinon l’acheteur ne pourra pas l’utiliser, surtout sur iPhone (verrouillage d’activation).</li>
  <li><strong>Retirez la carte SIM et la carte mémoire.</strong></li>
  <li><strong>Nettoyez l’appareil</strong> et rassemblez les accessoires (chargeur, boîte, écouteurs, facture si possible).</li>
</ul>

<h2>2. Fixer le bon prix</h2>
<p>Le prix dépend de plusieurs facteurs : modèle, capacité de stockage, âge, état de l’écran et de la batterie, accessoires et facture d’origine. La bonne méthode : partez du prix du neuf, appliquez une décote réaliste, puis <strong>comparez avec les annonces similaires</strong> déjà en ligne. Un prix juste se vend en quelques jours.</p>
<h3>Ce qui fait monter (ou baisser) le prix</h3>
<table>
<thead><tr><th>Facteur</th><th>Fait monter le prix ⬆️</th><th>Fait baisser le prix ⬇️</th></tr></thead>
<tbody>
  <tr><td>Âge du modèle</td><td>Récent (1–2 ans)</td><td>Ancien (4 ans+)</td></tr>
  <tr><td>Stockage</td><td>128 Go et plus</td><td>32–64 Go</td></tr>
  <tr><td>État écran</td><td>Impeccable</td><td>Rayures, impact, pixels morts</td></tr>
  <tr><td>Batterie</td><td>Bonne santé / changée</td><td>Usée, se décharge vite</td></tr>
  <tr><td>Accessoires & facture</td><td>Boîte + chargeur + facture</td><td>Téléphone seul</td></tr>
</tbody>
</table>

<h2>3. Rédiger une annonce qui inspire confiance</h2>
<ul>
  <li><strong>Photos réelles</strong> de VOTRE téléphone (pas une image trouvée sur Internet), allumé, sous plusieurs angles.</li>
  <li><strong>État honnête</strong> : mentionnez les rayures ou la santé de la batterie. La transparence accélère la vente.</li>
  <li><strong>Infos clés</strong> : modèle exact, stockage, état, accessoires inclus, raison de la vente.</li>
</ul>

<h2>4. Vendre en toute sécurité</h2>
<div class="box">
<p>L’arnaque classique : un « acheteur » envoie un <strong>faux SMS de confirmation Wave/Orange Money</strong> et repart avec le téléphone sans avoir réellement payé. Pour l’éviter, passez par une plateforme à <strong>paiement sécurisé</strong> : sur NEXUS Market, l’acheteur règle via la plateforme et l’argent vous est reversé sur Orange Money ou Wave <strong>après confirmation</strong>. Vous ne remettez le téléphone qu’une fois la commande validée.</p>
</div>

<h2>5. Publier en 2 minutes</h2>
<p>Avec l’<strong>annonce express</strong>, vous pouvez mettre votre téléphone en vente très rapidement, même sans créer de compte. Si vous vendez régulièrement (accessoires, plusieurs appareils), ouvrez une <a href="${origin}/guide/vendre-sur-nexus-market">boutique vendeur</a> pour tout gérer au même endroit.</p>

<h2>6. Conclure la vente</h2>
<p>Proposez la livraison ou un point de retrait sûr. À la remise, vérifiez que la commande est bien confirmée côté plateforme avant de céder l’appareil. Un échange clair et un bon emballage = un avis positif, utile pour vos prochaines ventes.</p>

<a class="cta gold" href="${origin}/?register=vendor">Vendre mon téléphone maintenant →</a>
<p style="margin-top:1.4rem">Voir aussi : <a href="${origin}/guide/paiement-mobile-money">Paiement Orange Money &amp; Wave</a> · <a href="${origin}/guide/acheter-en-ligne-au-senegal">Acheter sans se faire arnaquer</a></p>`;

  return contentResponse(renderContentPage({
    origin, path: '/guide/vendre-telephone-occasion-senegal',
    title: 'Vendre son téléphone d’occasion au Sénégal — guide pratique',
    description: 'Comment vendre son smartphone d’occasion au Sénégal au meilleur prix et sans arnaque : préparation, prix, annonce, paiement sécurisé Orange Money & Wave.',
    h1: 'Vendre son téléphone d’occasion', crumbName: 'Guide — Vendre un téléphone',
    isArticle: true, bodyHtml: body, extraGraph: [faq],
  }));
}
