// functions/blog/bien-annoncer-location-materiel.js
import { renderContentPage, contentResponse } from '../_lib/contentpage.js';

export async function onRequest({ request, env }) {
  const origin = env.SITE_URL || new URL(request.url).origin;
  const faq = {
    '@type': 'FAQPage',
    mainEntity: [
      { '@type': 'Question', name: 'Faut-il fixer une caution pour toute location ?', acceptedAnswer: { '@type': 'Answer', text: 'Ce n\'est pas obligatoire, mais recommandé pour le matériel de valeur (sonorisation, outillage électroportatif) afin de couvrir un éventuel dommage.' } },
      { '@type': 'Question', name: 'Comment fixer le prix d\'une location ?', acceptedAnswer: { '@type': 'Answer', text: 'Comparez avec des annonces similaires déjà publiées, et proposez un tarif dégressif pour les locations de plusieurs jours afin d\'attirer plus de demandes.' } },
    ],
  };
  const body = `
<h1>Bien rédiger une annonce de location de matériel</h1>
<p class="lead">Que vous louiez du matériel événementiel, des outils de chantier ou de l'électroménager, une annonce claire et complète se loue plus vite et évite les malentendus. Voici les éléments à ne pas oublier.</p>

<div class="tldr">
<h2>À retenir</h2>
<ul>
  <li>Précisez toujours la durée de location possible (jour, week-end, semaine) et le tarif correspondant.</li>
  <li>Indiquez clairement les conditions de caution et d'état des lieux.</li>
  <li>Des photos sous plusieurs angles rassurent sur l'état réel du matériel.</li>
</ul>
</div>

<h2>1. Décrire précisément le matériel</h2>
<p>Marque, modèle, dimensions, capacité ou puissance selon le type d'objet : plus votre description est précise, moins vous recevrez de questions inutiles et plus vous attirerez des demandes sérieuses et adaptées à leur besoin réel.</p>

<h2>2. Un tarif clair, adapté à la durée</h2>
<table>
<thead><tr><th>Durée</th><th>Bonne pratique tarifaire</th></tr></thead>
<tbody>
<tr><td>1 jour</td><td>Tarif plein, adapté à un usage ponctuel (mariage, chantier court)</td></tr>
<tr><td>Week-end</td><td>Tarif forfaitaire légèrement dégressif par rapport à 2 jours au tarif plein</td></tr>
<tr><td>Semaine ou plus</td><td>Tarif dégressif clairement affiché, pour attirer les locations longues</td></tr>
</tbody>
</table>

<h2>3. Préciser les conditions de caution</h2>
<p>Indiquez si une caution est demandée, son montant, et les conditions de restitution (état des lieux à la remise, franchise en cas de dommage). Cette transparence évite les désaccords en fin de location et rassure le locataire potentiel.</p>

<h2>4. Des photos qui montrent l'état réel</h2>
<p>Photographiez le matériel sous plusieurs angles, y compris ses éventuels défauts d'usage. Un locataire qui découvre une annonce honnête aura davantage confiance et sera moins tenté de négocier après coup sur l'état constaté à la remise.</p>

<h2>5. Répondre vite aux demandes</h2>
<p>Une location est souvent un besoin urgent (événement à venir, chantier en cours). Répondre rapidement aux messages augmente nettement vos chances de conclure la location avant que le client ne se tourne vers une autre annonce.</p>

<div class="box">
<p>Pour les mêmes principes appliqués à la vente d'un bien plutôt qu'à sa location, consultez notre guide <a href="${origin}/guide/reussir-annonce-photos-prix-senegal">réussir son annonce : photos & prix</a>.</p>
</div>

<a class="cta" href="${origin}/location">Voir les annonces de location →</a>
<p style="margin-top:1.4rem">Voir aussi : <a href="${origin}/blog">Tous les articles du blog</a> · <a href="${origin}/guides">Tous les guides</a></p>`;

  return contentResponse(renderContentPage({
    origin, path: '/blog/bien-annoncer-location-materiel',
    title: 'Bien rédiger une annonce de location de matériel',
    description: 'Conseils pour rédiger une annonce de location de matériel efficace au Sénégal : description, tarif selon la durée, caution et photos.',
    h1: 'Bien rédiger une annonce de location de matériel', crumbName: 'Blog — Annonce de location',
    isArticle: true, datePublished: '2026-07-06', bodyHtml: body, extraGraph: [faq],
  }));
}
