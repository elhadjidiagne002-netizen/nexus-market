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

<h2>1. Le mobile money, moyen de paiement n°1</h2>
<p>Au Sénégal, une grande partie de la population n’a pas de compte bancaire classique mais possède un portefeuille mobile. Orange Money et Wave servent à envoyer de l’argent, payer des factures, recharger du crédit et, de plus en plus, régler ses achats en ligne. C’est rapide, accessible partout, et cela ne nécessite qu’un numéro de téléphone.</p>

<h2>2. Orange Money</h2>
<p>Service historique d’Orange, <strong>Orange Money</strong> bénéficie d’une couverture nationale très étendue et d’un réseau dense de points de retrait. Vous payez en validant la transaction avec votre code secret. Des frais peuvent s’appliquer selon le type d’opération.</p>

<h2>3. Wave</h2>
<p><strong>Wave</strong> s’est imposé grâce à une application simple et à des transferts entre particuliers souvent gratuits, avec des frais marchands réduits. Le QR code et le lien de paiement sont au cœur de son expérience.</p>

<h2>4. Comparatif rapide</h2>
<ul>
  <li><strong>Couverture / points cash</strong> : avantage Orange Money.</li>
  <li><strong>Frais entre particuliers</strong> : avantage Wave (souvent gratuits).</li>
  <li><strong>Simplicité de l’app</strong> : Wave très apprécié.</li>
  <li><strong>Sur NEXUS</strong> : les deux sont acceptés, ainsi que la carte bancaire.</li>
</ul>
<p>Le « meilleur » dépend de votre usage. L’essentiel pour un achat en ligne n’est pas l’opérateur, mais que le paiement soit <strong>sécurisé par la plateforme</strong>.</p>

<h2>5. Pourquoi payer via NEXUS plutôt qu’en direct ?</h2>
<div class="box">
<p>Envoyer de l’argent directement sur le numéro d’un vendeur que vous ne connaissez pas, c’est prendre tous les risques : aucune protection si la commande n’arrive pas. En passant par NEXUS, votre paiement est <strong>séquestré</strong> et n’est libéré au vendeur qu’après confirmation de réception. En cas de problème, vous ouvrez un litige et vous êtes remboursé. C’est toute la différence entre un transfert et un <em>paiement marchand protégé</em>.</p>
</div>

<h2>6. La carte bancaire</h2>
<p>Visa et Mastercard sont également acceptées pour ceux qui préfèrent. Le traitement est chiffré et confié à un prestataire de paiement certifié ; NEXUS ne conserve jamais votre numéro de carte.</p>

<h2>7. Bonnes pratiques de sécurité</h2>
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
