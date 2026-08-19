// functions/blog/louer-appartement-bureau-local-dakar.js
import { renderContentPage, contentResponse } from '../_lib/contentpage.js';

export async function onRequest({ request, env }) {
  const origin = env.SITE_URL || new URL(request.url).origin;
  const faq = {
    '@type': 'FAQPage',
    mainEntity: [
      { '@type': 'Question', name: 'Combien coûte la caution pour louer un appartement à Dakar ?', acceptedAnswer: { '@type': 'Answer', text: 'La caution demandée varie généralement entre 1 et 3 mois de loyer selon le bailleur et le quartier — négociez-la avant de signer, surtout pour un premier bail.' } },
      { '@type': 'Question', name: 'Faut-il un garant pour louer un bureau ou un local commercial ?', acceptedAnswer: { '@type': 'Answer', text: 'Ce n\'est pas systématique, mais de nombreux propriétaires de locaux professionnels le demandent, surtout pour une nouvelle entreprise sans historique. Un dépôt de garantie plus élevé peut parfois en tenir lieu.' } },
      { '@type': 'Question', name: 'Quels documents préparer avant de visiter un bien à louer ?', acceptedAnswer: { '@type': 'Answer', text: 'Pièce d\'identité, justificatif de revenus ou de l\'activité (pour un local pro), et si possible une lettre de recommandation d\'un précédent bailleur — cela accélère la décision du propriétaire.' } },
    ],
  };
  const body = `
<h1>Louer un appartement, un bureau ou un local à Dakar : le guide complet</h1>
<p class="lead">Entre les quartiers résidentiels de Dakar, les zones d'affaires du Plateau ou des Almadies, et les locaux commerciaux en périphérie, trouver le bon bien à louer demande de connaître quelques repères. Voici comment s'y retrouver.</p>

<div class="tldr">
<h2>À retenir</h2>
<ul>
  <li>Le prix varie énormément selon le quartier : comparez toujours plusieurs annonces avant de vous engager.</li>
  <li>Visitez le bien en personne (ou faites-le visiter par une personne de confiance) avant tout versement.</li>
  <li>Vérifiez systématiquement l'état des lieux, les charges incluses (eau, électricité, gardiennage) et la durée du bail.</li>
</ul>
</div>

<h2>1. Appartement, bureau ou local commercial : des marchés différents</h2>
<p>La location résidentielle (studio, appartement, villa) répond surtout à une logique de quartier et de proximité (écoles, transports, marchés). La location de bureaux et de locaux commerciaux dépend davantage de la visibilité, de l'accès et de la surface disponible. Les deux marchés se croisent parfois sur des biens mixtes (rez-de-chaussée commercial + étages résidentiels), fréquents dans les quartiers denses de Dakar.</p>

<h2>2. Ce qui fait varier les prix</h2>
<table>
<thead><tr><th>Facteur</th><th>Impact sur le loyer</th></tr></thead>
<tbody>
<tr><td>Quartier</td><td>Écart important entre Plateau/Almadies et périphérie</td></tr>
<tr><td>Standing (climatisation, gardiennage, parking)</td><td>Majore sensiblement le loyer</td></tr>
<tr><td>Durée du bail</td><td>Un engagement plus long permet souvent de négocier</td></tr>
<tr><td>Charges incluses ou non</td><td>Toujours vérifier ce qui est réellement compris</td></tr>
</tbody>
</table>

<h2>3. Les points à vérifier avant de signer</h2>
<ul>
  <li><strong>L'état des lieux</strong> : photos datées à l'entrée, pour éviter tout litige à la sortie.</li>
  <li><strong>Les charges</strong> : eau, électricité, gardiennage, entretien des parties communes — précisez ce qui est inclus dans le loyer.</li>
  <li><strong>La durée et les conditions de résiliation</strong> : délai de préavis, pénalités éventuelles en cas de départ anticipé.</li>
  <li><strong>Pour un local commercial</strong> : vérifiez que l'activité prévue est autorisée à cette adresse (certains baux résidentiels excluent une activité commerciale).</li>
</ul>

<h2>4. Où chercher</h2>
<p>NEXUS Market référence des annonces de location d'appartements, de bureaux et de locaux commerciaux dans plusieurs villes du Sénégal, avec les coordonnées directes du bailleur ou de l'agence. Consultez la <a href="${origin}/categorie/services">catégorie Services</a> pour parcourir les biens disponibles, ou affinez par ville dans la <a href="${origin}/ville/dakar">page Dakar</a>.</p>

<a class="cta" href="${origin}/categorie/services">Voir les biens à louer →</a>
<p style="margin-top:1.4rem">Voir aussi : <a href="${origin}/blog">Tous les articles du blog</a> · <a href="${origin}/blog/louer-ou-acheter-materiel-btp-chantier">Louer ou acheter du matériel BTP</a></p>`;

  return contentResponse(renderContentPage({
    origin, path: '/blog/louer-appartement-bureau-local-dakar',
    title: 'Louer un appartement, un bureau ou un local à Dakar : le guide complet',
    description: 'Location résidentielle et professionnelle à Dakar et au Sénégal : prix, points à vérifier avant de signer, et où trouver des annonces fiables.',
    h1: 'Louer un appartement, un bureau ou un local à Dakar : le guide complet', crumbName: 'Blog — Location immobilière',
    isArticle: true, datePublished: '2026-08-19', bodyHtml: body, extraGraph: [faq],
  }));
}
