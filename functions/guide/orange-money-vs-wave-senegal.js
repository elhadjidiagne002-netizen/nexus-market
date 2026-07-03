// functions/guide/orange-money-vs-wave-senegal.js → /guide/orange-money-vs-wave-senegal
import { renderContentPage, contentResponse } from '../_lib/contentpage.js';

export async function onRequest({ request, env }) {
  const origin = env.SITE_URL || new URL(request.url).origin;
  const faq = {
    '@type': 'FAQPage',
    mainEntity: [
      { '@type': 'Question', name: 'Orange Money ou Wave : lequel est le moins cher ?', acceptedAnswer: { '@type': 'Answer', text: 'Pour les transferts entre particuliers, Wave s’est fait connaître avec des frais très bas, voire gratuits sur certains envois, tandis qu’Orange Money applique une grille de frais par tranche. Pour un paiement marchand sur NEXUS Market, le coût pour vous, acheteur, est le même : vous réglez le montant de la commande.' } },
      { '@type': 'Question', name: 'Puis-je payer sur NEXUS Market avec les deux ?', acceptedAnswer: { '@type': 'Answer', text: 'Oui. NEXUS accepte Orange Money et Wave (ainsi que la carte bancaire). Au moment de payer, vous choisissez votre moyen préféré et vous êtes redirigé vers la page sécurisée de l’opérateur pour valider.' } },
      { '@type': 'Question', name: 'Est-ce risqué de payer par mobile money ?', acceptedAnswer: { '@type': 'Answer', text: 'Le paiement mobile est sûr tant que vous restez dans le circuit officiel. Le risque vient des arnaques « hors plateforme » : ne déposez jamais d’argent directement sur le numéro personnel d’un vendeur. Sur NEXUS, le paiement est séquestré jusqu’à la réception.' } },
    ],
  };
  const body = `
<h1>Orange Money ou Wave : lequel choisir au Sénégal ?</h1>
<p class="lead">Orange Money et Wave sont les deux poids lourds du paiement mobile au Sénégal. Pour envoyer de l’argent, payer une commande en ligne ou retirer du cash, lequel est le plus avantageux ? Comparatif clair, sans jargon, pour choisir selon votre usage.</p>

<div class="tldr">
<h2>À retenir</h2>
<ul>
  <li><strong>Wave</strong> : réputé pour ses frais bas sur les transferts entre particuliers et son appli simple.</li>
  <li><strong>Orange Money</strong> : réseau d’agents le plus dense, paiement de factures, et écosystème très large.</li>
  <li>Pour <strong>payer sur NEXUS Market</strong>, les deux marchent — choisissez celui que vous avez déjà.</li>
  <li>La règle d’or : ne payez <strong>jamais</strong> sur un numéro personnel hors de la plateforme.</li>
</ul>
</div>

<h2>1. Deux approches différentes</h2>
<p>Orange Money est le service historique, adossé à l’opérateur Orange et à un maillage d’agents dans tout le pays, jusque dans les petites localités. Wave est arrivé plus tard avec un positionnement clair : une application mobile épurée et des frais de transfert réduits, qui ont bousculé le marché. Les deux permettent aujourd’hui d’envoyer de l’argent, de payer des marchands, de recharger du crédit et de régler des factures.</p>

<h2>2. Les frais : ce qui change pour vous</h2>
<p>Sur les <strong>transferts entre particuliers</strong>, Wave a popularisé des frais très faibles, ce qui explique son adoption rapide, surtout chez les jeunes et pour les petits montants du quotidien. Orange Money applique une grille par tranche de montant. Pour le <strong>retrait de cash</strong>, chaque service a ses conditions selon l’agent et le montant.</p>
<p>Bonne nouvelle côté achats : quand vous <strong>payez une commande sur NEXUS Market</strong>, vous réglez simplement le prix affiché. Le choix Orange Money ou Wave ne change pas ce que vous payez pour votre panier — prenez celui où vous avez déjà un solde.</p>

<h2>3. La couverture et la praticité</h2>
<p>Si vous vivez ou achetez souvent en <strong>région</strong>, la densité d’agents Orange Money peut être un atout pour déposer ou retirer du cash près de chez vous. En ville, notamment à Dakar, les deux réseaux sont largement disponibles. Côté application, beaucoup d’utilisateurs trouvent Wave très intuitif pour les envois rapides, tandis qu’Orange Money couvre un éventail de services plus large (factures, forfaits, etc.).</p>

<h2>4. La sécurité : le vrai enjeu</h2>
<div class="box">
<p><strong>Le danger n’est pas l’outil, c’est l’usage.</strong> Orange Money comme Wave sont sûrs quand vous restez dans le circuit officiel. Les arnaques surviennent quand un « vendeur » vous demande de déposer l’argent directement sur son numéro personnel, en dehors de toute plateforme : là, vous n’avez aucun recours. Sur NEXUS Market, le paiement passe par la plateforme et reste <strong>séquestré</strong> jusqu’à ce que vous confirmiez la réception — vous êtes remboursé si la commande n’arrive pas.</p>
</div>
<p>Protégez toujours votre code PIN, méfiez-vous des faux SMS « vous avez reçu de l’argent, renvoyez-le », et vérifiez systématiquement le nom du bénéficiaire avant de valider.</p>

<h2>5. Alors, lequel choisir ?</h2>
<ul>
  <li><strong>Vous faites surtout des petits transferts entre proches ?</strong> Wave est souvent le plus économique.</li>
  <li><strong>Vous payez des factures et retirez du cash en région ?</strong> Orange Money et son réseau d’agents sont précieux.</li>
  <li><strong>Vous voulez juste payer vos achats en ligne ?</strong> Les deux fonctionnent sur NEXUS — inutile de changer d’habitude.</li>
</ul>

<a class="cta" href="${origin}/">Payer avec Orange Money ou Wave sur NEXUS →</a>
<p style="margin-top:1.4rem">Voir aussi : <a href="${origin}/guide/paiement-mobile-money">Le paiement mobile money expliqué</a> · <a href="${origin}/guide/acheter-en-ligne-au-senegal">Acheter en ligne en sécurité</a></p>`;

  return contentResponse(renderContentPage({
    origin, path: '/guide/orange-money-vs-wave-senegal',
    title: 'Orange Money ou Wave : lequel choisir au Sénégal ? (comparatif)',
    description: 'Comparatif Orange Money vs Wave au Sénégal : frais, couverture, sécurité et lequel choisir pour envoyer de l’argent ou payer en ligne. Les deux acceptés sur NEXUS Market.',
    h1: 'Orange Money ou Wave', crumbName: 'Guide — Orange Money vs Wave',
    isArticle: true, bodyHtml: body, extraGraph: [faq],
  }));
}
