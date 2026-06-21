// functions/guide/paiement-mobile-money.js → /guide/paiement-mobile-money
import { renderContentPage, contentResponse } from '../_lib/contentpage.js';

export async function onRequest({ request, env }) {
  const origin = env.SITE_URL || new URL(request.url).origin;
  const faq = {
    '@type': 'FAQPage',
    mainEntity: [
      { '@type': 'Question', name: 'Orange Money ou Wave : lequel choisir pour payer en ligne ?', acceptedAnswer: { '@type': 'Answer', text: 'Les deux sont acceptés sur NEXUS Market. Wave est apprécié pour ses transferts souvent gratuits entre particuliers ; Orange Money pour sa très large couverture. Pour un paiement marchand sécurisé, le plus important est que la transaction passe par la plateforme.' } },
      { '@type': 'Question', name: 'Le paiement par carte bancaire est-il sûr ?', acceptedAnswer: { '@type': 'Answer', text: 'Oui. Les paiements par carte (Visa/Mastercard) sont traités par un prestataire certifié et chiffrés. NEXUS ne stocke pas votre numéro de carte.' } },
    ],
  };
  const body = `
<h1>Payer avec Orange Money & Wave au Sénégal</h1>
<p class="lead">Le paiement mobile a transformé le commerce au Sénégal. Orange Money et Wave permettent de payer en ligne en quelques secondes, depuis son téléphone, sans carte bancaire. Voici comment ils fonctionnent, leurs frais, leur sécurité, et comment ils s’intègrent à la garantie acheteur NEXUS.</p>

<div class="tldr">
<h2>À retenir</h2>
<ul>
  <li><strong>Orange Money, Wave et carte bancaire</strong> sont tous acceptés sur NEXUS Market.</li>
  <li>Le « meilleur » dépend de votre usage — l’essentiel est que le paiement passe par la plateforme.</li>
  <li>Un <strong>paiement marchand protégé</strong> (séquestre) vaut mieux qu’un transfert direct : remboursement possible en cas de problème.</li>
  <li>Ne communiquez <strong>jamais</strong> votre code secret ni un code reçu par SMS.</li>
</ul>
</div>

<h2>1. Le mobile money, moyen de paiement n°1</h2>
<p>Au Sénégal, une grande partie de la population n’a pas de compte bancaire classique mais possède un portefeuille mobile. Orange Money et Wave servent à envoyer de l’argent, payer des factures, recharger du crédit et, de plus en plus, régler ses achats en ligne. C’est rapide, accessible partout, et cela ne nécessite qu’un numéro de téléphone.</p>

<h2>2. Orange Money</h2>
<p>Service historique d’Orange, <strong>Orange Money</strong> bénéficie d’une couverture nationale très étendue et d’un réseau dense de points de retrait. Vous payez en validant la transaction avec votre code secret. Des frais peuvent s’appliquer selon le type d’opération.</p>

<h2>3. Wave</h2>
<p><strong>Wave</strong> s’est imposé grâce à une application simple et à des transferts entre particuliers souvent gratuits, avec des frais marchands réduits. Le QR code et le lien de paiement sont au cœur de son expérience.</p>

<h2>4. Orange Money vs Wave : le comparatif</h2>
<table>
<thead><tr><th>Critère</th><th>Orange Money</th><th>Wave</th></tr></thead>
<tbody>
  <tr><td>Couverture & points cash</td><td>Très étendue (réseau historique Orange)</td><td>Large, en forte croissance</td></tr>
  <tr><td>Frais entre particuliers</td><td>Frais selon l’opération</td><td>Souvent gratuits</td></tr>
  <tr><td>Frais marchands</td><td>Variables</td><td>Réduits</td></tr>
  <tr><td>Expérience appli</td><td>Complète (factures, crédit, etc.)</td><td>Très simple, QR code & lien</td></tr>
  <tr><td>Validation</td><td>Code secret</td><td>Code secret / QR</td></tr>
  <tr><td>Accepté sur NEXUS</td><td>✅ Oui</td><td>✅ Oui</td></tr>
</tbody>
</table>
<p>Le « meilleur » dépend de votre usage : Orange Money pour la couverture et le cash de proximité, Wave pour la simplicité et les transferts gratuits. Pour un achat en ligne, l’essentiel n’est pas l’opérateur, mais que le paiement soit <strong>sécurisé par la plateforme</strong>.</p>

<h2>5. Payer en ligne, étape par étape</h2>
<ol>
  <li>Sur la fiche produit, ajoutez au panier puis validez votre adresse de livraison.</li>
  <li>Choisissez votre moyen de paiement : Orange Money, Wave ou carte bancaire.</li>
  <li>Confirmez : pour le mobile money, validez la transaction avec votre code secret sur votre téléphone.</li>
  <li>Votre paiement est <strong>séquestré</strong> par NEXUS (il n’est pas encore versé au vendeur).</li>
  <li>À réception du colis, vous <strong>confirmez la livraison</strong> : c’est ce qui débloque le versement au vendeur.</li>
</ol>

<h2>6. Frais : à quoi s’attendre</h2>
<p>Les frais de mobile money varient selon l’opérateur, le type d’opération (transfert vs paiement marchand) et le montant. Quelques repères utiles :</p>
<ul>
  <li>Les <strong>transferts entre particuliers</strong> sont souvent gratuits chez Wave, payants chez Orange Money selon le palier.</li>
  <li>Les <strong>paiements marchands</strong> appliquent généralement des frais réduits, parfois à la charge du commerçant.</li>
  <li>Vérifiez toujours le <strong>montant total affiché avant de valider</strong> : il inclut les frais éventuels.</li>
</ul>
<p>Astuce : pour les gros montants, comparez le coût total (frais inclus) entre vos options avant de payer.</p>

<h2>7. Pourquoi payer via NEXUS plutôt qu’en direct ?</h2>
<div class="box">
<p>Envoyer de l’argent directement sur le numéro d’un vendeur que vous ne connaissez pas, c’est prendre tous les risques : aucune protection si la commande n’arrive pas. En passant par NEXUS, votre paiement est <strong>séquestré</strong> et n’est libéré au vendeur qu’après confirmation de réception. En cas de problème, vous ouvrez un litige et vous êtes remboursé. C’est toute la différence entre un transfert et un <em>paiement marchand protégé</em>.</p>
</div>

<h2>8. La carte bancaire</h2>
<p>Visa et Mastercard sont également acceptées pour ceux qui préfèrent. Le traitement est chiffré et confié à un prestataire de paiement certifié ; NEXUS ne conserve jamais votre numéro de carte.</p>

<h2>9. Bonnes pratiques de sécurité</h2>
<ul>
  <li>Ne communiquez <strong>jamais</strong> votre code secret Orange Money / Wave à quiconque.</li>
  <li>Vérifiez le montant avant de valider.</li>
  <li>Conservez le reçu / la référence de transaction.</li>
  <li>Méfiez-vous des messages vous demandant un code reçu par SMS : c’est une tentative d’arnaque.</li>
</ul>

<a class="cta" href="${origin}/">Acheter en toute sécurité →</a>
<p style="margin-top:1.4rem">Voir aussi : <a href="${origin}/guide/acheter-en-ligne-au-senegal">Acheter sans se faire arnaquer</a> · <a href="${origin}/faq">FAQ paiement & livraison</a></p>`;

  return contentResponse(renderContentPage({
    origin, path: '/guide/paiement-mobile-money',
    title: 'Payer avec Orange Money & Wave au Sénégal — guide',
    description: 'Orange Money vs Wave : fonctionnement, frais, sécurité et paiement marchand protégé. Comment payer en ligne au Sénégal en toute confiance sur NEXUS Market.',
    h1: 'Payer avec Orange Money & Wave', crumbName: 'Guide — Paiement mobile',
    isArticle: true, bodyHtml: body, extraGraph: [faq],
  }));
}
