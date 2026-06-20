// functions/guide/acheter-mouton-tabaski-senegal.js → /guide/acheter-mouton-tabaski-senegal
import { renderContentPage, contentResponse } from '../_lib/contentpage.js';

export async function onRequest({ request, env }) {
  const origin = env.SITE_URL || new URL(request.url).origin;
  const faq = {
    '@type': 'FAQPage',
    mainEntity: [
      { '@type': 'Question', name: 'Quand acheter son mouton de Tabaski ?', acceptedAnswer: { '@type': 'Answer', text: 'Idéalement 2 à 4 semaines avant la fête : les prix grimpent fortement dans les derniers jours. Réserver tôt auprès d’un éleveur géolocalisé permet d’avoir plus de choix et un meilleur prix.' } },
      { '@type': 'Question', name: 'Comment reconnaître un mouton en bonne santé ?', acceptedAnswer: { '@type': 'Answer', text: 'Un animal vif, à la démarche assurée, avec des yeux clairs sans écoulement, un nez propre, une bonne dentition et une chair ferme. Méfiez-vous d’un mouton apathique, qui boite ou tousse.' } },
    ],
  };
  const body = `
<h1>Acheter un mouton de Tabaski au Sénégal : le guide complet</h1>
<p class="lead">La Tabaski (Aïd el-Kébir) est le moment le plus important de l’année pour des millions de familles sénégalaises. Bien choisir son mouton, au bon prix et au bon moment, demande un peu de méthode. Voici nos conseils pour un achat réussi — et comment trouver un éleveur de confiance près de chez vous.</p>

<h2>1. Quand acheter ?</h2>
<p>Les prix du bétail suivent une courbe très nette à l’approche de la fête : raisonnables plusieurs semaines avant, ils s’envolent dans les derniers jours quand la demande explose. Le bon compromis se situe <strong>2 à 4 semaines avant la Tabaski</strong> : vous avez encore du choix, des prix maîtrisés, et le temps de garder l’animal. Réserver auprès d’un éleveur en amont est souvent la meilleure stratégie.</p>

<h2>2. Comment reconnaître un bon mouton</h2>
<ul>
  <li><strong>Vivacité</strong> : un animal alerte, qui réagit, se tient droit et marche sans boiter.</li>
  <li><strong>Yeux et nez</strong> : yeux clairs sans écoulement, nez propre et sec.</li>
  <li><strong>Dentition</strong> : elle renseigne sur l’âge ; un mouton trop vieux a une chair moins tendre.</li>
  <li><strong>État corporel</strong> : chair ferme et bien répartie, sans maigreur ni gonflement anormal.</li>
  <li><strong>Pelage</strong> : propre, sans plaques ni parasites visibles.</li>
</ul>
<p>Le <em>ladoum</em> reste la race la plus prisée pour son gabarit imposant, mais d’excellents moutons de races locales conviennent parfaitement et coûtent moins cher.</p>

<h2>3. Bien négocier le prix</h2>
<p>La négociation fait partie de la tradition. Renseignez-vous sur les prix pratiqués cette année, fixez-vous un budget, et n’hésitez pas à comparer plusieurs éleveurs. Acheter directement auprès de l’éleveur, sans intermédiaire, permet souvent d’obtenir un meilleur tarif.</p>

<h2>4. Trouver un éleveur de confiance près de chez vous</h2>
<div class="box">
<p>Sur NEXUS Market, l’espace <strong>NEXUS Élevage</strong> vous met en relation directe avec des éleveurs <strong>géolocalisés</strong> : vous voyez ceux qui sont proches de vous, leurs animaux et leurs coordonnées, et vous les contactez en un clic. Plus besoin de courir les foirails à l’aveugle. <a href="${origin}/devenir-eleveur">Vous êtes éleveur ? Référencez-vous ici.</a></p>
</div>

<h2>5. Transport et garde de l’animal</h2>
<p>Anticipez le transport (un mouton, ça ne rentre pas toujours dans un taxi !) et l’endroit où vous allez le garder quelques jours : un coin ombragé, de l’eau propre et un peu de fourrage suffisent. Plus vous achetez tôt, plus la logistique est sereine.</p>

<h2>6. Acheter en sécurité</h2>
<p>Comme pour tout achat, méfiez-vous des offres trop belles et des paiements demandés d’avance par un inconnu. Privilégiez le contact direct, vérifiez l’animal de visu quand c’est possible, et gardez une trace de vos échanges. Nos conseils anti-arnaque s’appliquent aussi ici : voir le <a href="${origin}/guide/acheter-en-ligne-au-senegal">guide de l’achat en ligne</a>.</p>

<a class="cta" href="${origin}/?register=breeder">Trouver / devenir éleveur sur NEXUS →</a>
<p style="margin-top:1.4rem">Voir aussi : <a href="${origin}/guide/livraison-au-senegal">La livraison au Sénégal</a> · <a href="${origin}/guides">Tous les guides</a></p>`;

  return contentResponse(renderContentPage({
    origin, path: '/guide/acheter-mouton-tabaski-senegal',
    title: 'Acheter un mouton de Tabaski au Sénégal — guide & conseils',
    description: 'Quand et comment acheter son mouton de Tabaski au Sénégal : bon moment, critères de santé, négociation du prix, transport et éleveurs géolocalisés de confiance.',
    h1: 'Acheter un mouton de Tabaski', crumbName: 'Guide — Mouton de Tabaski',
    isArticle: true, bodyHtml: body, extraGraph: [faq],
  }));
}
