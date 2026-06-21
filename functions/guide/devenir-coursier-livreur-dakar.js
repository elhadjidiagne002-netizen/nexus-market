// functions/guide/devenir-coursier-livreur-dakar.js → /guide/devenir-coursier-livreur-dakar
import { renderContentPage, contentResponse } from '../_lib/contentpage.js';

export async function onRequest({ request, env }) {
  const origin = env.SITE_URL || new URL(request.url).origin;
  const faq = {
    '@type': 'FAQPage',
    mainEntity: [
      { '@type': 'Question', name: 'Faut-il une moto pour devenir coursier NEXUS ?', acceptedAnswer: { '@type': 'Answer', text: 'Une moto est idéale pour la rapidité à Dakar, mais vous pouvez aussi livrer à vélo, en voiture ou même à pied selon les courses et votre zone. L’essentiel est d’être fiable et joignable.' } },
      { '@type': 'Question', name: 'Comment et quand suis-je payé ?', acceptedAnswer: { '@type': 'Answer', text: 'Vous gagnez la majeure partie du tarif de chaque course (NEXUS garde une commission). Les gains sont versés sur Orange Money ou Wave depuis votre espace livreur.' } },
    ],
  };
  const body = `
<h1>Devenir coursier / livreur à Dakar avec NEXUS</h1>
<p class="lead">La livraison est l’un des métiers qui recrutent le plus avec l’essor du e-commerce au Sénégal. Avec une moto et une bonne connaissance de Dakar, vous pouvez gagner un revenu en livrant des commandes près de chez vous, à votre rythme. Voici comment démarrer.</p>

<h2>1. Pourquoi devenir coursier ?</h2>
<ul>
  <li><strong>Revenu flexible</strong> : vous vous connectez quand vous voulez et acceptez les courses qui vous arrangent.</li>
  <li><strong>Paiement mobile</strong> : vos gains arrivent sur Orange Money ou Wave.</li>
  <li><strong>Demande forte</strong> : de plus en plus d’achats en ligne = de plus en plus de livraisons à effectuer.</li>
</ul>

<h2>2. Ce qu’il faut pour commencer</h2>
<ul>
  <li>Un moyen de déplacement (moto de préférence à Dakar, mais vélo/voiture possibles).</li>
  <li>Un smartphone avec connexion data et le GPS activé.</li>
  <li>Une bonne connaissance des quartiers et des raccourcis.</li>
  <li>Le sens du service : ponctualité, politesse, soin des colis.</li>
</ul>

<h2>3. Comment ça marche sur NEXUS</h2>
<div class="box">
<p>Une fois inscrit comme livreur, vous passez « en ligne » dans votre espace. Lorsqu’une course se présente <strong>près de votre position</strong>, vous recevez une notification : adresse de retrait, destination et tarif. Vous acceptez, récupérez le colis, suivez l’itinéraire et confirmez la livraison. Le tout est <strong>géolocalisé en temps réel</strong>, ce qui rassure le client et fluidifie la course.</p>
</div>

<h2>4. Combien peut-on gagner ?</h2>
<p>Vos revenus dépendent du nombre de courses, des distances et de vos plages horaires. Vous percevez la majeure partie du tarif de livraison ; NEXUS prélève une commission de service. Plus vous êtes actif aux heures de pointe (midi, fin de journée) et bien noté, plus vous enchaînez les courses.</p>

<h2>5. Conseils pour réussir</h2>
<ul>
  <li><strong>Soyez ponctuel</strong> et prévenez en cas d’imprévu.</li>
  <li><strong>Protégez les colis</strong> (sac de livraison, attention à la pluie).</li>
  <li><strong>Demandez un point de repère clair</strong> au client — l’adressage est un défi à Dakar.</li>
  <li><strong>Soignez vos notes</strong> : un livreur bien noté reçoit plus de courses.</li>
  <li><strong>Roulez prudemment</strong> : votre sécurité d’abord.</li>
</ul>

<h2>6. S’inscrire</h2>
<p>L’inscription est rapide : créez votre compte livreur, renseignez votre type de véhicule et votre zone, puis passez en ligne. Votre candidature est validée, et vous pouvez commencer à accepter des courses.</p>

<a class="cta" href="${origin}/?register=courier">Devenir livreur NEXUS →</a>
<p style="margin-top:1.4rem">Voir aussi : <a href="${origin}/guide/livraison-au-senegal">La livraison au Sénégal</a> · <a href="${origin}/guides">Tous les guides</a></p>`;

  return contentResponse(renderContentPage({
    origin, path: '/guide/devenir-coursier-livreur-dakar',
    title: 'Devenir coursier / livreur à Dakar — guide & revenus',
    description: 'Comment devenir coursier-livreur à Dakar avec NEXUS : prérequis, fonctionnement des courses géolocalisées, revenus, paiement Orange Money/Wave et conseils pour réussir.',
    h1: 'Devenir coursier / livreur à Dakar', crumbName: 'Guide — Devenir livreur',
    isArticle: true, bodyHtml: body, extraGraph: [faq],
  }));
}
