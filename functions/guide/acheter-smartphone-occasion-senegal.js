// functions/guide/acheter-smartphone-occasion-senegal.js → /guide/acheter-smartphone-occasion-senegal
import { renderContentPage, contentResponse } from '../_lib/contentpage.js';

export async function onRequest({ request, env }) {
  const origin = env.SITE_URL || new URL(request.url).origin;
  const faq = {
    '@type': 'FAQPage',
    mainEntity: [
      { '@type': 'Question', name: 'Comment vérifier qu’un téléphone d’occasion n’est pas volé ?', acceptedAnswer: { '@type': 'Answer', text: 'Composez *#06# pour afficher l’IMEI, demandez la facture d’achat d’origine, et méfiez-vous d’un prix anormalement bas. Sur NEXUS, privilégiez les vendeurs vérifiés et payez via la plateforme pour être protégé.' } },
      { '@type': 'Question', name: 'Neuf, reconditionné ou occasion : quelle différence ?', acceptedAnswer: { '@type': 'Answer', text: 'Le neuf est scellé et sous garantie constructeur. Le reconditionné a été testé et remis en état par un professionnel. L’occasion « entre particuliers » est vendue telle quelle : c’est souvent le moins cher, mais c’est à vous de bien vérifier l’état.' } },
      { '@type': 'Question', name: 'Comment tester un smartphone avant de payer ?', acceptedAnswer: { '@type': 'Answer', text: 'Vérifiez l’écran (points morts, tactile), les caméras, le haut-parleur, le micro, la charge, le Wi-Fi, la SIM et surtout l’état de la batterie. Sur iPhone, regardez « Capacité maximale » dans Réglages > Batterie.' } },
    ],
  };
  const body = `
<h1>Acheter un smartphone d’occasion au Sénégal sans se tromper</h1>
<p class="lead">Un bon téléphone d’occasion coûte deux à trois fois moins cher que le neuf. Mais entre les modèles « trop beaux pour être vrais » et les appareils bloqués, l’achat demande quelques vérifications. Voici la méthode complète pour acheter malin et en sécurité.</p>

<div class="tldr">
<h2>À retenir</h2>
<ul>
  <li>Exigez l’<strong>IMEI</strong> (<code>*#06#</code>) et la <strong>facture d’origine</strong>.</li>
  <li>Testez écran, batterie, caméras, charge et réseau <strong>avant</strong> de valider.</li>
  <li>Un prix trop bas = signal d’alerte (vol, panne cachée, blocage iCloud).</li>
  <li>Payez via la plateforme : votre argent est <strong>protégé</strong> jusqu’à réception.</li>
</ul>
</div>

<h2>1. Définir son besoin et son budget</h2>
<p>Avant de chercher, posez-vous trois questions : pour quel usage (photo, jeux, réseaux sociaux, travail), quelle taille d’écran, et quel budget maximum ? En occasion, un modèle « haut de gamme d’il y a deux ans » offre souvent un meilleur rapport qualité-prix qu’un modèle « entrée de gamme neuf ». Repérez 2-3 références qui vous plaisent, puis comparez les prix pratiqués pour ne pas surpayer.</p>

<h2>2. Vérifier que l’appareil est « propre »</h2>
<p>C’est l’étape la plus importante. Un smartphone d’occasion doit être <strong>légitime et débloqué</strong> :</p>
<ol>
  <li><strong>IMEI</strong> : composez <code>*#06#</code> sur le téléphone. Notez le numéro et demandez la facture au vendeur.</li>
  <li><strong>Comptes verrouillés</strong> : sur iPhone, l’appareil ne doit plus être associé à un identifiant Apple (pas de « verrouillage d’activation » iCloud). Sur Android, vérifiez qu’aucun compte Google n’est resté connecté.</li>
  <li><strong>Blocage opérateur</strong> : assurez-vous que le téléphone accepte n’importe quelle carte SIM.</li>
  <li><strong>Prix cohérent</strong> : un modèle récent à un quart de sa valeur cache presque toujours un problème.</li>
</ol>

<h2>3. Tester l’état réel en 5 minutes</h2>
<div class="box">
<p>Passez en revue, dans l’ordre : l’<strong>écran</strong> (cherchez points morts et zones tactiles insensibles), les <strong>caméras</strong> avant et arrière, le <strong>haut-parleur</strong> et le <strong>micro</strong> (passez un appel test), la <strong>charge</strong> (le téléphone charge-t-il vraiment ?), le <strong>Wi-Fi</strong> et la <strong>SIM</strong>. Vérifiez enfin la <strong>batterie</strong> : sur iPhone, Réglages &gt; Batterie &gt; État de la batterie affiche la « capacité maximale » (au-dessus de 85 %, c’est correct).</p>
</div>

<h2>4. Occasion, reconditionné ou neuf ?</h2>
<p>L’<strong>occasion entre particuliers</strong> est la moins chère, mais sans garantie : à vous de vérifier. Le <strong>reconditionné</strong> a été testé et remis en état par un professionnel, souvent avec une petite garantie — un bon compromis. Le <strong>neuf</strong> reste le plus sûr mais le plus cher. Choisissez selon votre tolérance au risque et votre budget.</p>

<h2>5. Payer et recevoir en sécurité</h2>
<p>Ne remettez jamais l’argent « à l’avance » sur un numéro personnel. Sur NEXUS Market, réglez via la plateforme : le paiement est <strong>séquestré</strong> et n’est versé au vendeur qu’après votre confirmation de réception. Si le téléphone ne correspond pas ou n’arrive pas, vous ouvrez un litige et vous êtes remboursé. Pour une remise en main propre, privilégiez un lieu public et de jour.</p>

<a class="cta" href="${origin}/?view=catalog&category=Informatique">Voir les smartphones sur NEXUS →</a>
<p style="margin-top:1.4rem">Voir aussi : <a href="${origin}/guide/acheter-en-ligne-au-senegal">Acheter en ligne en sécurité</a> · <a href="${origin}/guide/vendre-telephone-occasion-senegal">Vendre son téléphone d’occasion</a></p>`;

  return contentResponse(renderContentPage({
    origin, path: '/guide/acheter-smartphone-occasion-senegal',
    title: 'Acheter un smartphone d’occasion au Sénégal : le guide complet',
    description: 'Comment acheter un smartphone d’occasion au Sénégal sans se faire avoir : vérifier l’IMEI, tester la batterie et l’écran, éviter les téléphones bloqués, payer en sécurité.',
    h1: 'Acheter un smartphone d’occasion', crumbName: 'Guide — Smartphone d’occasion',
    isArticle: true, bodyHtml: body, extraGraph: [faq],
  }));
}
