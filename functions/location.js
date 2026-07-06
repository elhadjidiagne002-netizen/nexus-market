// functions/location.js → /location — hub SEO NEXUS Location (location de matériel).
import { renderContentPage, contentResponse } from './_lib/contentpage.js';

export async function onRequest({ request, env }) {
  const origin = env.SITE_URL || new URL(request.url).origin;
  const appUrl = `${origin}/?rental=1`;

  const benefits = [
    ['🔑', 'Louez plutôt qu’acheter', 'Matériel événementiel, BTP, électroménager… disponible à la location près de chez vous.'],
    ['💬', 'Mise en relation directe', 'Contactez le loueur par WhatsApp pour convenir des modalités et de la caution.'],
    ['💰', 'Économique', 'Idéal pour un besoin ponctuel : mariage, chantier, déménagement…'],
  ];
  const faq = [
    ['Comment fonctionne NEXUS Location ?', 'Les annonces de location sont publiées comme des produits classiques (matériel, prix, disponibilité). Vous contactez le loueur directement par WhatsApp pour organiser la remise et la caution.'],
    ['Quel type de matériel puis-je louer ?', 'Matériel événementiel (chaises, sonorisation…), BTP (bétonnière, échafaudage…), électroménager et bien plus, selon les annonces disponibles.'],
    ['Comment publier une annonce de location ?', 'Publiez une annonce produit depuis votre compte vendeur et cochez l’option location.'],
    ['La caution est-elle obligatoire ?', 'Cela dépend du loueur : la plupart des locations de matériel de valeur (sonorisation, outillage) demandent une caution, à convenir directement avec le loueur.'],
    ['Que se passe-t-il en cas de dommage sur le matériel loué ?', 'Les modalités (état des lieux, franchise, retenue sur caution) se négocient entre le locataire et le loueur avant la remise du matériel.'],
    ['Puis-je louer pour une seule journée ?', 'Oui, la plupart des annonces événementielles proposent une tarification à la journée ou au week-end.'],
  ];

  const categories = [
    ['🎉', 'Événementiel & réception', 'Chaises, tables, sonorisation, vaisselle et décoration pour mariages, baptêmes et fêtes.'],
    ['🏗️', 'Outillage & BTP', 'Bétonnière, échafaudage, perceuse et matériel de chantier pour travaux ponctuels.'],
    ['🧊', 'Électroménager', 'Réfrigérateurs, congélateurs et gros électroménager pour un besoin temporaire.'],
    ['🚗', 'Transport & mobilité', 'Véhicules et équipements de mobilité disponibles selon les annonces locales.'],
  ];

  const body = `
<h1>🔑 NEXUS Location — louer du matériel</h1>
<p class="lead">Un besoin ponctuel — événementiel, BTP, électroménager — sans vouloir acheter ? Découvrez les annonces de location disponibles près de chez vous et contactez le loueur en direct.</p>
<a class="cta" href="${appUrl}">Voir les annonces de location →</a>
<div class="cards">
${benefits.map(([e, t, d]) => `<div class="card"><h3>${e} ${t}</h3><p>${d}</p></div>`).join('')}
</div>
<h2>Ce que vous pouvez louer</h2>
<div class="cards">
${categories.map(([e, t, d]) => `<div class="card"><h3>${e} ${t}</h3><p>${d}</p></div>`).join('')}
</div>
<h2>Pourquoi louer plutôt qu'acheter ?</h2>
<p>Pour un mariage, un chantier de rénovation ou un déménagement, l'achat de matériel neuf représente souvent un investissement disproportionné par rapport à un usage ponctuel. NEXUS Location connecte directement particuliers et professionnels disposant de matériel disponible, sans intermédiaire ni frais cachés — vous négociez le prix et les modalités en direct avec le loueur.</p>
<h2>Questions fréquentes</h2>
${faq.map(([q, a]) => `<h3>${q}</h3><p>${a}</p>`).join('')}
<a class="cta" href="${appUrl}">Voir les annonces de location →</a>`;

  return contentResponse(renderContentPage({
    origin, path: '/location',
    title: 'NEXUS Location — louer du matériel au Sénégal',
    description: 'NEXUS Location : trouvez du matériel à louer près de chez vous (événementiel, BTP, électroménager) et contactez le loueur directement.',
    h1: 'NEXUS Location — louer du matériel', crumbName: 'Location', isArticle: false,
    extraGraph: [{
      '@type': 'FAQPage',
      mainEntity: faq.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })),
    }],
    bodyHtml: body,
  }));
}
