// functions/guide/eviter-arnaques-achats-en-ligne-senegal.js → /guide/eviter-arnaques-achats-en-ligne-senegal
import { renderContentPage, contentResponse } from '../_lib/contentpage.js';

export async function onRequest({ request, env }) {
  const origin = env.SITE_URL || new URL(request.url).origin;
  const faq = {
    '@type': 'FAQPage',
    mainEntity: [
      { '@type': 'Question', name: 'Comment reconnaître une annonce d\'arnaque en ligne ?', acceptedAnswer: { '@type': 'Answer', text: 'Un prix anormalement bas, un vendeur qui refuse la remise en main propre ou le paiement via plateforme, des photos volées sur Internet, une urgence inventée (« dernier article ») et une demande de virement direct sur un numéro mobile sont les signaux les plus courants.' } },
      { '@type': 'Question', name: 'Que faire si j\'ai été arnaqué sur un achat en ligne ?', acceptedAnswer: { '@type': 'Answer', text: 'Contactez immédiatement le service client de la plateforme pour ouvrir un litige. Sur NEXUS Market, le paiement est séquestré : si le colis n\'arrive pas ou ne correspond pas, vous êtes remboursé. Si l\'argent a été envoyé directement (virement Wave/OM), signalez-le à votre opérateur et déposez une plainte à la Division Spéciale de Cybercriminalité (DSC) au Sénégal.' } },
      { '@type': 'Question', name: 'Est-il risqué de payer avec Wave ou Orange Money pour un achat en ligne ?', acceptedAnswer: { '@type': 'Answer', text: 'Payer en direct sur le numéro du vendeur = risque élevé car il n\'y a pas de protection acheteur. Utilisez toujours une plateforme sécurisée qui séquestre le paiement. Wave et Orange Money sont des moyens de paiement fiables quand ils transitent par une plateforme qui garantit la transaction.' } },
    ],
  };
  const body = `
<h1>Éviter les arnaques lors des achats en ligne au Sénégal</h1>
<p class="lead">Le commerce en ligne au Sénégal se développe vite, mais les arnaques aussi. La bonne nouvelle : la grande majorité se reconnaissent facilement une fois qu'on sait quoi chercher. Ce guide vous donne les réflexes qui protègent avant, pendant et après l'achat.</p>

<div class="tldr">
<h2>À retenir</h2>
<ul>
  <li>Un prix trop beau = <strong>signal d'alerte</strong>. Comparez avec le marché.</li>
  <li>Ne payez <strong>jamais en direct</strong> sur le numéro d'un inconnu. Utilisez une plateforme.</li>
  <li>Vérifiez le profil du vendeur : ancienneté, avis, nombre de ventes.</li>
  <li>En cas de doute, proposez une <strong>remise en main propre</strong> dans un lieu public.</li>
</ul>
</div>

<h2>1. Les arnaques les plus courantes</h2>
<p>Connaître les schémas classiques permet de les repérer avant d'être piégé :</p>
<ol>
  <li><strong>Le prix trop bas</strong> : un iPhone récent à 50 000 FCFA, un téléviseur « offert » à un tiers du marché. C'est le signal numéro un. Le vendeur prétexte souvent un départ rapide à l'étranger, une succession, ou un « lot en surplus ».</li>
  <li><strong>Le virement avant envoi</strong> : le vendeur demande à recevoir le paiement avant d'expédier, parfois via Wave ou Orange Money. Une fois le virement effectué, il disparaît.</li>
  <li><strong>La photo volée</strong> : l'annonce utilise des images prises sur Google Images ou chez un revendeur officiel. L'article réel (s'il existe) est complètement différent.</li>
  <li><strong>L'article « en transit »</strong> : le vendeur prétend être à Thiès, à Saint-Louis, ou en déplacement, et demande à envoyer l'argent pour « couvrir les frais de transport ».</li>
  <li><strong>Le faux site de plateforme</strong> : un lien ressemblant à une grande marketplace mais avec une URL légèrement différente (ex. nexus-market.sn vs nexusmarket.sn) pour vous faire payer sur un faux site.</li>
</ol>

<h2>2. Vérifier un vendeur en 3 minutes</h2>
<div class="box">
<p>Avant d'acheter, contrôlez : <strong>la date d'inscription</strong> (un compte créé il y a 2 jours est suspect), le <strong>nombre de ventes</strong> et les <strong>avis laissés par d'autres acheteurs</strong>. Un vendeur sérieux répond rapidement à vos questions et accepte que vous vérifiez l'article. S'il refuse toute question ou fait pression pour que vous payiez vite, c'est un mauvais signe.</p>
</div>

<h2>3. Les bonnes pratiques de paiement</h2>
<p>La règle d'or : <strong>ne remettez jamais l'argent avant d'avoir l'article entre les mains</strong>, sauf si vous utilisez une plateforme qui séquestre le paiement. Sur NEXUS Market, le montant est retenu par la plateforme et versé au vendeur uniquement après que vous avez confirmé la réception. Si le produit ne correspond pas ou n'arrive pas, vous ouvrez un litige et vous êtes remboursé. C'est la différence entre une transaction sécurisée et un paiement direct à risque.</p>

<h2>4. La remise en main propre : comment la sécuriser</h2>
<p>Pour les petits montants ou les articles volumineux, la remise en main propre est souvent la solution la plus simple. Quelques précautions :</p>
<ul>
  <li>Choisissez un <strong>lieu public et animé</strong> (marché, pharmacie, banque) en plein jour.</li>
  <li>Ne vous déplacez pas seul pour un article de valeur.</li>
  <li>Inspectez et testez l'article <strong>avant</strong> de payer.</li>
  <li>N'apportez que la somme prévue — pas plus.</li>
</ul>

<h2>5. Que faire si vous êtes victime d'une arnaque ?</h2>
<p>Si vous avez payé via NEXUS Market, contactez immédiatement le <a href="${origin}/contact">service client</a> pour ouvrir un litige. Si le paiement a été fait en direct (Wave, Orange Money) : signalez-le à votre opérateur via l'application (ils peuvent parfois bloquer ou retracer la transaction) et déposez une plainte à la <strong>Division Spéciale de Cybercriminalité (DSC)</strong> — c'est gratuit et c'est la voie officielle au Sénégal pour ce type de fraude.</p>

<a class="cta" href="${origin}/">Acheter en sécurité sur NEXUS →</a>
<p style="margin-top:1.4rem">Voir aussi : <a href="${origin}/guide/acheter-en-ligne-au-senegal">Acheter en ligne au Sénégal</a> · <a href="${origin}/guide/paiement-mobile-money">Payer avec Orange Money &amp; Wave</a></p>`;

  return contentResponse(renderContentPage({
    origin, path: '/guide/eviter-arnaques-achats-en-ligne-senegal',
    title: 'Éviter les arnaques achats en ligne au Sénégal — guide complet',
    description: 'Reconnaître et éviter les arnaques sur les achats en ligne au Sénégal : prix suspect, faux vendeurs, paiement à risque. Les bons réflexes pour acheter sans se faire avoir.',
    h1: 'Éviter les arnaques en ligne', crumbName: 'Guide — Arnaques en ligne',
    isArticle: true, bodyHtml: body, extraGraph: [faq],
  }));
}
