// functions/blog/location-courte-vs-longue-duree-materiel.js
import { renderContentPage, contentResponse } from '../_lib/contentpage.js';

export async function onRequest({ request, env }) {
  const origin = env.SITE_URL || new URL(request.url).origin;
  const faq = {
    '@type': 'FAQPage',
    mainEntity: [
      { '@type': 'Question', name: 'À partir de combien de temps la location longue durée devient-elle intéressante ?', acceptedAnswer: { '@type': 'Answer', text: 'Ça dépend du matériel, mais généralement au-delà de 2-3 semaines d\'usage continu, un tarif dégressif longue durée devient nettement plus avantageux qu\'un renouvellement de location courte à répétition.' } },
      { '@type': 'Question', name: 'Peut-on négocier le prix pour une location longue durée ?', acceptedAnswer: { '@type': 'Answer', text: 'Oui, de nombreux loueurs proposent spontanément un tarif dégressif au-delà d\'une certaine durée — n\'hésitez pas à demander directement si ce n\'est pas précisé dans l\'annonce.' } },
    ],
  };
  const body = `
<h1>Location courte durée vs longue durée : comment choisir</h1>
<p class="lead">Que ce soit pour un véhicule, du matériel événementiel ou un logement, la durée de location influence fortement le prix total et les conditions. Voici comment faire le bon choix.</p>

<div class="tldr">
<h2>À retenir</h2>
<ul>
  <li>Comparez toujours le coût total sur la durée réelle d'utilisation, pas seulement le tarif journalier.</li>
  <li>La location longue durée offre souvent un tarif dégressif, à négocier si ce n'est pas déjà proposé.</li>
  <li>La location courte durée reste plus flexible pour un besoin ponctuel ou incertain.</li>
</ul>
</div>

<h2>1. Calculer le vrai coût selon la durée</h2>
<table>
<thead><tr><th>Durée d'usage</th><th>Formule généralement la plus avantageuse</th></tr></thead>
<tbody>
<tr><td>1 à quelques jours</td><td>Location courte durée (tarif journalier)</td></tr>
<tr><td>Plusieurs semaines</td><td>Location longue durée, souvent avec tarif dégressif</td></tr>
<tr><td>Besoin incertain</td><td>Courte durée, plus flexible pour ajuster</td></tr>
</tbody>
</table>

<h2>2. Les avantages de la longue durée</h2>
<p>Au-delà d'un certain seuil, la location longue durée devient nettement plus économique qu'un renouvellement répété de location courte. Elle offre aussi souvent une meilleure disponibilité garantie sur toute la période, utile pour un chantier ou un événement étalé dans le temps.</p>

<h2>3. Quand préférer la courte durée</h2>
<p>Pour un besoin ponctuel ou si vous n'êtes pas certain de la durée nécessaire, la location courte durée reste plus prudente — vous évitez de payer pour une période que vous n'utiliserez finalement pas.</p>

<h2>4. Trouver le bon matériel</h2>
<p>NEXUS Market référence du matériel et des véhicules en location dans plusieurs catégories, avec les conditions de chaque prestataire précisées sur l'annonce.</p>

<a class="cta" href="${origin}/location">Voir le matériel disponible →</a>
<p style="margin-top:1.4rem">Voir aussi : <a href="${origin}/blog">Tous les articles du blog</a> · <a href="${origin}/blog/louer-ou-acheter-materiel-btp-chantier">Louer ou acheter du matériel BTP</a></p>`;

  return contentResponse(renderContentPage({
    origin, path: '/blog/location-courte-vs-longue-duree-materiel',
    title: 'Location courte durée vs longue durée : comment choisir',
    description: 'Location de matériel ou de véhicule au Sénégal : comment choisir entre courte et longue durée selon votre besoin réel.',
    h1: 'Location courte durée vs longue durée : comment choisir', crumbName: 'Blog — Courte vs longue durée',
    isArticle: true, datePublished: '2026-08-19', bodyHtml: body, extraGraph: [faq],
  }));
}
