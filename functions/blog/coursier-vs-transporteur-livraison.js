// functions/blog/coursier-vs-transporteur-livraison.js
import { renderContentPage, contentResponse } from '../_lib/contentpage.js';

export async function onRequest({ request, env }) {
  const origin = env.SITE_URL || new URL(request.url).origin;
  const faq = {
    '@type': 'FAQPage',
    mainEntity: [
      { '@type': 'Question', name: 'Quand choisir un coursier plutôt qu\'un transporteur classique ?', acceptedAnswer: { '@type': 'Answer', text: 'Pour un besoin urgent, un petit colis et une livraison en ville (typiquement à Dakar), le coursier est plus rapide et suivi en direct. Pour un envoi volumineux ou entre villes, un transporteur ou le covoiturage colis est plus adapté.' } },
      { '@type': 'Question', name: 'Le covoiturage peut-il remplacer un transporteur pour un colis ?', acceptedAnswer: { '@type': 'Answer', text: 'Oui pour un colis de taille raisonnable sur une liaison inter-villes où un trajet est déjà publié, à condition que le conducteur accepte les colis sur son trajet.' } },
    ],
  };
  const body = `
<h1>Coursier ou transporteur : quel mode de livraison choisir ?</h1>
<p class="lead">Colis urgent en ville, envoi entre deux régions, achat volumineux : chaque situation appelle un mode de livraison différent. Voici comment choisir la solution adaptée sur NEXUS Market.</p>

<div class="tldr">
<h2>À retenir</h2>
<ul>
  <li>Coursier NEXUS : idéal pour un besoin urgent, en ville, avec suivi GPS en direct.</li>
  <li>Covoiturage (colis) : économique pour un envoi entre deux villes, sur un trajet déjà prévu.</li>
  <li>Livraison classique vendeur : adaptée aux achats catalogue standards, sans urgence particulière.</li>
</ul>
</div>

<h2>1. Le coursier : rapidité en ville</h2>
<p>Pour un document urgent, un achat en boutique à récupérer, ou un petit colis à faire parvenir dans l'heure à quelqu'un dans la même ville, <a href="${origin}/coursier">NEXUS Coursier</a> reste la solution la plus rapide : un livreur proche accepte la course et vous suivez sa position en temps réel jusqu'à la remise.</p>

<h2>2. Le covoiturage : économique entre deux villes</h2>
<p>Pour un envoi entre deux villes (Dakar-Thiès, Dakar-Saint-Louis…), faire transporter un colis via <a href="${origin}/covoiturage">NEXUS Covoiturage</a> — sur un trajet déjà publié par un conducteur acceptant les colis — coûte généralement moins cher qu'un transporteur dédié, à condition qu'un trajet corresponde à votre besoin et à votre calendrier.</p>

<h2>3. La livraison classique : pour les achats catalogue</h2>
<p>Pour un achat standard sur la marketplace (produit, annonce express), la livraison proposée par le vendeur ou le réseau de coursiers partenaires reste la solution par défaut, avec des délais variables selon la ville — voir <a href="${origin}/guide/livraison-au-senegal">la livraison au Sénégal</a> et <a href="${origin}/guide/comprendre-frais-livraison-dakar">comprendre les frais de livraison à Dakar</a>.</p>

<h2>4. Tableau comparatif rapide</h2>
<table>
<thead><tr><th>Besoin</th><th>Solution recommandée</th></tr></thead>
<tbody>
<tr><td>Urgent, en ville</td><td>Coursier NEXUS</td></tr>
<tr><td>Colis entre deux villes, non urgent</td><td>Covoiturage (si trajet disponible)</td></tr>
<tr><td>Achat catalogue standard</td><td>Livraison classique du vendeur</td></tr>
<tr><td>Objet volumineux (meuble, électroménager)</td><td>Livraison classique ou transporteur dédié selon le vendeur</td></tr>
</tbody>
</table>

<a class="cta" href="${origin}/coursier">Commander un coursier →</a>
<p style="margin-top:1.4rem">Voir aussi : <a href="${origin}/blog">Tous les articles du blog</a> · <a href="${origin}/guides">Tous les guides</a></p>`;

  return contentResponse(renderContentPage({
    origin, path: '/blog/coursier-vs-transporteur-livraison',
    title: 'Coursier ou transporteur : quel mode de livraison choisir ?',
    description: 'Comparatif pratique entre coursier NEXUS, covoiturage colis et livraison classique selon l\'urgence, la distance et le volume de votre envoi au Sénégal.',
    h1: 'Coursier ou transporteur : quel mode de livraison choisir ?', crumbName: 'Blog — Coursier vs transporteur',
    isArticle: true, datePublished: '2026-07-06', bodyHtml: body, extraGraph: [faq],
  }));
}
