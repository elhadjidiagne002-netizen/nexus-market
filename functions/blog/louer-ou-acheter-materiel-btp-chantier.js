// functions/blog/louer-ou-acheter-materiel-btp-chantier.js
import { renderContentPage, contentResponse } from '../_lib/contentpage.js';

export async function onRequest({ request, env }) {
  const origin = env.SITE_URL || new URL(request.url).origin;
  const faq = {
    '@type': 'FAQPage',
    mainEntity: [
      { '@type': 'Question', name: 'À partir de combien de jours l\'achat devient-il rentable ?', acceptedAnswer: { '@type': 'Answer', text: 'Cela dépend du matériel, mais au-delà de plusieurs semaines d\'utilisation cumulée, l\'achat devient souvent plus économique que des locations répétées — faites le calcul selon votre cas précis.' } },
      { '@type': 'Question', name: 'Peut-on louer du matériel BTP pour un particulier ?', acceptedAnswer: { '@type': 'Answer', text: 'Oui, la location de matériel BTP n\'est pas réservée aux professionnels ; de nombreux particuliers louent pour des travaux ponctuels de rénovation.' } },
    ],
  };
  const body = `
<h1>Louer ou acheter du matériel BTP pour un chantier ponctuel ?</h1>
<p class="lead">Bétonnière, échafaudage, perceuse professionnelle : pour un chantier limité dans le temps, faut-il investir dans l'achat ou privilégier la location ? Voici comment trancher.</p>

<div class="tldr">
<h2>À retenir</h2>
<ul>
  <li>Pour un usage ponctuel (un seul chantier), la location est presque toujours plus économique.</li>
  <li>L'achat se justifie pour un usage récurrent ou professionnel régulier.</li>
  <li>Comparez toujours le coût total de la location sur la durée du chantier au prix d'achat neuf.</li>
</ul>
</div>

<h2>1. Le cas de la location : idéal pour un usage ponctuel</h2>
<p>Pour un chantier limité dans le temps — rénovation d'une pièce, construction d'un mur, travaux de finition —, la location permet d'accéder à du matériel professionnel sans l'investissement de l'achat, ni les contraintes de stockage et d'entretien une fois le chantier terminé. Voir <a href="${origin}/location">NEXUS Location</a> pour trouver du matériel disponible près de chez vous.</p>

<h2>2. Le cas de l'achat : pour un usage régulier</h2>
<p>Si vous prévoyez d'utiliser régulièrement le même équipement (professionnel du bâtiment, propriétaire multipliant les projets), l'achat devient rentable sur la durée, malgré l'investissement de départ plus important.</p>

<h2>3. Faire le calcul avant de choisir</h2>
<table>
<thead><tr><th>Critère</th><th>Location</th><th>Achat</th></tr></thead>
<tbody>
<tr><td>Investissement initial</td><td>Faible</td><td>Élevé</td></tr>
<tr><td>Usage ponctuel (1 chantier)</td><td>Recommandé</td><td>Rarement rentable</td></tr>
<tr><td>Usage régulier</td><td>Coût cumulé élevé</td><td>Recommandé</td></tr>
<tr><td>Entretien & stockage</td><td>À la charge du loueur</td><td>À votre charge</td></tr>
</tbody>
</table>

<h2>4. Bien négocier sa location</h2>
<p>Comparez plusieurs annonces de location avant de vous engager, et vérifiez les conditions de caution et l'état du matériel avant la remise — notre guide <a href="${origin}/blog/bien-annoncer-location-materiel">bien rédiger une annonce de location de matériel</a> détaille les points à vérifier, côté loueur comme côté locataire.</p>

<a class="cta" href="${origin}/location">Voir le matériel disponible →</a>
<p style="margin-top:1.4rem">Voir aussi : <a href="${origin}/blog">Tous les articles du blog</a> · <a href="${origin}/categorie/maison">Catégorie Maison & Déco</a></p>`;

  return contentResponse(renderContentPage({
    origin, path: '/blog/louer-ou-acheter-materiel-btp-chantier',
    title: 'Louer ou acheter du matériel BTP pour un chantier ponctuel ?',
    description: 'Location ou achat de matériel BTP au Sénégal : comment choisir selon la durée et la fréquence d\'utilisation de votre chantier.',
    h1: 'Louer ou acheter du matériel BTP pour un chantier ponctuel ?', crumbName: 'Blog — Location BTP',
    isArticle: true, datePublished: '2026-07-06', bodyHtml: body, extraGraph: [faq],
  }));
}
