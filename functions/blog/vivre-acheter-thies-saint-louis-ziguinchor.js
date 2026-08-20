// functions/blog/vivre-acheter-thies-saint-louis-ziguinchor.js
import { renderContentPage, contentResponse } from '../_lib/contentpage.js';

export async function onRequest({ request, env }) {
  const origin = env.SITE_URL || new URL(request.url).origin;
  const faq = {
    '@type': 'FAQPage',
    mainEntity: [
      { '@type': 'Question', name: 'Les prix sont-ils moins chers en région qu\'à Dakar ?', acceptedAnswer: { '@type': 'Answer', text: 'Souvent oui pour le logement, mais ça varie selon les catégories de produits — comparez toujours plusieurs annonces locales avant de conclure.' } },
      { '@type': 'Question', name: 'La livraison NEXUS Market fonctionne-t-elle en dehors de Dakar ?', acceptedAnswer: { '@type': 'Answer', text: 'Oui, la livraison est disponible partout au Sénégal — voir notre guide sur les frais de livraison pour le détail selon les zones.' } },
    ],
  };
  const body = `
<h1>Vivre et acheter à Thiès, Saint-Louis ou Ziguinchor : le guide NEXUS</h1>
<p class="lead">En dehors de Dakar, chaque grande ville du Sénégal a ses spécificités pour acheter, vendre ou trouver un service. Voici un aperçu pour Thiès, Saint-Louis et Ziguinchor.</p>

<div class="tldr">
<h2>À retenir</h2>
<ul>
  <li>Chaque ville a son propre dynamisme commercial — comparez les annonces locales avant d'acheter.</li>
  <li>La livraison NEXUS Market est disponible dans tout le pays, pas seulement à Dakar.</li>
  <li>Les artisans et prestataires locaux référencés permettent souvent d'éviter un déplacement inutile vers Dakar.</li>
</ul>
</div>

<h2>1. Thiès</h2>
<p>Ville industrielle et commerciale importante, Thiès dispose d'un marché actif pour l'électronique, l'automobile et les services. Consultez la <a href="${origin}/ville/thies">page Thiès</a> pour les annonces disponibles dans la ville.</p>

<h2>2. Saint-Louis</h2>
<p>Entre patrimoine historique et activité économique régionale, Saint-Louis a ses propres besoins spécifiques, notamment autour de la pêche et de l'artisanat local. Consultez la <a href="${origin}/ville/saint-louis">page Saint-Louis</a> pour explorer les annonces de la région.</p>

<h2>3. Ziguinchor</h2>
<p>Porte d'entrée de la Casamance, Ziguinchor bénéficie notamment de la liaison ferry avec Dakar (voir notre guide <a href="${origin}/blog/choisir-ligne-transport-bus-car-ferry-senegal">bien choisir sa ligne de transport</a>). Consultez la <a href="${origin}/ville/ziguinchor">page Ziguinchor</a> pour les annonces locales.</p>

<h2>4. Acheter et vendre partout au Sénégal</h2>
<p>NEXUS Market référence des annonces, artisans et services dans toutes les grandes villes du pays, avec une livraison disponible partout — voir notre guide <a href="${origin}/guide/livraison-au-senegal">la livraison au Sénégal</a> pour le détail des délais et frais selon votre zone.</p>

<a class="cta" href="${origin}/">Explorer les annonces par ville →</a>
<p style="margin-top:1.4rem">Voir aussi : <a href="${origin}/blog">Tous les articles du blog</a> · <a href="${origin}/guide/comprendre-frais-livraison-dakar">Comprendre les frais de livraison</a></p>`;

  return contentResponse(renderContentPage({
    origin, path: '/blog/vivre-acheter-thies-saint-louis-ziguinchor',
    title: 'Vivre et acheter à Thiès, Saint-Louis ou Ziguinchor : le guide NEXUS',
    description: 'Acheter, vendre et trouver des services à Thiès, Saint-Louis et Ziguinchor : ce qui distingue chaque ville sur NEXUS Market.',
    h1: 'Vivre et acheter à Thiès, Saint-Louis ou Ziguinchor : le guide NEXUS', crumbName: 'Blog — Guide par ville',
    isArticle: true, datePublished: '2026-08-19', bodyHtml: body, extraGraph: [faq],
  }));
}
