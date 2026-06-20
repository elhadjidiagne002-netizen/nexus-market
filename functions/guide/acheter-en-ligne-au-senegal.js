// functions/guide/acheter-en-ligne-au-senegal.js → /guide/acheter-en-ligne-au-senegal
import { renderContentPage, contentResponse } from '../_lib/contentpage.js';

export async function onRequest({ request, env }) {
  const origin = env.SITE_URL || new URL(request.url).origin;
  const faq = {
    '@type': 'FAQPage',
    mainEntity: [
      { '@type': 'Question', name: 'Comment éviter les arnaques en achetant en ligne au Sénégal ?', acceptedAnswer: { '@type': 'Answer', text: 'Payez toujours via la plateforme (jamais par dépôt direct vers un numéro inconnu), vérifiez la réputation du vendeur, lisez les avis, et privilégiez les vendeurs vérifiés. La garantie acheteur NEXUS ne libère l’argent au vendeur qu’après confirmation de réception.' } },
      { '@type': 'Question', name: 'Que faire si je ne reçois pas ma commande ?', acceptedAnswer: { '@type': 'Answer', text: 'Ouvrez un litige depuis votre tableau de bord. Comme votre paiement reste protégé jusqu’à la confirmation de livraison, vous êtes remboursé si la commande n’arrive pas ou ne correspond pas.' } },
    ],
  };
  const body = `
<h1>Acheter en ligne au Sénégal en toute sécurité</h1>
<p class="lead">Le commerce en ligne explose au Sénégal, porté par le mobile money et la livraison de proximité. Mais comment commander sans se faire arnaquer ? Voici le guide complet pour acheter sereinement sur NEXUS Market et, plus largement, sur Internet au Sénégal.</p>

<h2>1. Pourquoi acheter en ligne plutôt qu’au marché ?</h2>
<p>L’achat en ligne fait gagner du temps et permet de comparer les prix sans se déplacer entre Sandaga, Colobane ou les boutiques de quartier. Vous accédez à un catalogue beaucoup plus large, vous lisez les avis d’autres acheteurs, et vous payez avec les moyens que vous utilisez déjà au quotidien : Orange Money, Wave ou carte bancaire. La livraison vient à vous, à Dakar comme en région.</p>

<h2>2. Les 5 réflexes pour ne pas se faire arnaquer</h2>
<ol>
  <li><strong>Ne payez jamais en dehors de la plateforme.</strong> Un vendeur qui vous demande de déposer de l’argent directement sur un numéro Wave ou Orange Money « pour aller plus vite » contourne toute protection. Sur NEXUS, le paiement transite par la plateforme et n’est versé au vendeur qu’après confirmation.</li>
  <li><strong>Vérifiez la réputation du vendeur</strong> : note moyenne, nombre d’avis, ancienneté, badge « vendeur vérifié ».</li>
  <li><strong>Lisez la description et les photos</strong> attentivement. En cas de doute, posez vos questions au vendeur avant de commander.</li>
  <li><strong>Méfiez-vous des prix trop bas.</strong> Un iPhone neuf à un quart de son prix est presque toujours une arnaque.</li>
  <li><strong>Gardez une trace</strong> : numéro de commande, conversation, reçu de paiement.</li>
</ol>

<h2>3. La protection acheteur NEXUS</h2>
<div class="box">
<p><strong>Votre argent est séquestré, pas envoyé immédiatement.</strong> Lorsque vous payez une commande, le montant est conservé par NEXUS et n’est libéré au vendeur qu’<em>après</em> que vous ayez confirmé la bonne réception. Si la commande n’arrive pas, ou ne correspond pas à ce qui était annoncé, vous ouvrez un litige et vous êtes remboursé. Les litiges sont traités sous 24 h.</p>
</div>
<p>Pour votre toute première commande, le « Premier achat garanti » vous rembourse intégralement en cas de fraude avérée (réclamation sous 48 h, transaction réglée via la plateforme). De quoi tester le service en confiance.</p>

<h2>4. Comment passer commande, étape par étape</h2>
<ol>
  <li>Recherchez le produit ou parcourez les catégories.</li>
  <li>Ouvrez la fiche : vérifiez prix, état, vendeur, frais et délai de livraison.</li>
  <li>Ajoutez au panier puis validez votre adresse de livraison.</li>
  <li>Payez avec Orange Money, Wave ou carte bancaire.</li>
  <li>Suivez votre commande, puis <strong>confirmez la réception</strong> une fois le colis reçu et conforme.</li>
</ol>

<h2>5. Bien choisir son mode de livraison</h2>
<p>Selon le vendeur et votre ville, vous aurez le choix entre la livraison à domicile, le retrait, ou le coursier à la demande pour Dakar. Pensez à donner un point de repère clair (« en face de la pharmacie X ») : l’adressage reste un défi au Sénégal, et un bon repère accélère la livraison. Voir notre <a href="${origin}/guide/livraison-au-senegal">guide de la livraison</a>.</p>

<h2>6. Et le paiement ?</h2>
<p>Orange Money et Wave sont devenus le moyen de paiement n°1 du e-commerce sénégalais. Nous expliquons leur fonctionnement, leurs frais et leur sécurité dans le <a href="${origin}/guide/paiement-mobile-money">guide du paiement mobile</a>.</p>

<a class="cta" href="${origin}/">Commencer mes achats sur NEXUS →</a>
<p style="margin-top:1.4rem">Voir aussi : <a href="${origin}/faq">la FAQ</a> · <a href="${origin}/guide/vendre-sur-nexus-market">Vendre sur NEXUS</a></p>`;

  return contentResponse(renderContentPage({
    origin, path: '/guide/acheter-en-ligne-au-senegal',
    title: 'Acheter en ligne au Sénégal en toute sécurité — le guide',
    description: 'Comment commander en ligne au Sénégal sans se faire arnaquer : protection acheteur, paiement Orange Money & Wave, vérifications, étapes et litiges.',
    h1: 'Acheter en ligne au Sénégal', crumbName: 'Guide — Acheter en ligne',
    isArticle: true, bodyHtml: body, extraGraph: [faq],
  }));
}
