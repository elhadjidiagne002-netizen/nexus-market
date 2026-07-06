// functions/elevage.js → /elevage — hub SEO acheteur « NEXUS Élevage & produits locaux »
// (distinct de /devenir-eleveur, qui cible le recrutement des éleveurs/producteurs).
import { renderContentPage, contentResponse } from './_lib/contentpage.js';

export async function onRequest({ request, env }) {
  const origin = env.SITE_URL || new URL(request.url).origin;
  const appUrl = `${origin}/?elevage=1`;

  const benefits = [
    ['🐏', 'Spécial Tabaski', 'Moutons, bétail et volaille près de chez vous à l’approche de l’Aïd.'],
    ['📍', 'Éleveurs proches de vous', 'Trouvez les éleveurs géolocalisés autour de votre position.'],
    ['🇸🇳', 'Produits du terroir', 'Fruits, légumes, miel et produits locaux directement des producteurs.'],
    ['💬', 'Contact direct', 'Échangez directement avec l’éleveur ou le producteur, sans intermédiaire.'],
  ];
  const faq = [
    ['Comment trouver un éleveur près de moi ?', 'Ouvrez NEXUS Élevage et activez votre position : la liste des éleveurs et producteurs proches s’affiche avec leur distance.'],
    ['Puis-je acheter un mouton de Tabaski en ligne ?', 'Oui, les éleveurs référencés publient leurs moutons et bétail comme des produits classiques, consultables et négociables directement.'],
    ['Comment devenir éleveur sur NEXUS ?', 'Rendez-vous sur la page dédiée : <a href="' + origin + '/devenir-eleveur">devenir éleveur / producteur</a>.'],
    ['Quels animaux trouve-t-on sur NEXUS Élevage ?', 'Moutons et béliers (Tabaski), volaille, bovins, chèvres, ainsi que des animaux de compagnie selon les annonces des éleveurs locaux.'],
    ['Comment vérifier la santé d’un animal avant l’achat ?', 'Demandez à l’éleveur des informations sur l’âge, le poids et l’état de santé ; un déplacement sur place est recommandé pour les achats de bétail.'],
    ['Les produits du terroir sont-ils garantis 100% locaux ?', 'Chaque producteur référencé indique la provenance de ses produits dans sa fiche ; privilégiez les profils avec avis et historique de ventes.'],
  ];

  const animalTypes = [
    ['🐑', 'Moutons & béliers', 'Le cœur de l’activité avant la Tabaski, avec des annonces classées par poids et par race.'],
    ['🐔', 'Volaille', 'Poulets, pintades et autres volailles vendues par des éleveurs de proximité.'],
    ['🐄', 'Bovins & bétail', 'Vaches, taureaux et bétail pour les besoins agricoles ou l’élevage familial.'],
    ['🐐', 'Chèvres', 'Une alternative appréciée pour les petits élevages et certaines célébrations.'],
  ];

  const body = `
<h1>🐏 NEXUS Élevage & produits locaux</h1>
<p class="lead">Trouvez des éleveurs et producteurs près de chez vous : moutons de Tabaski, volaille, bétail et produits du terroir sénégalais, en contact direct.</p>
<a class="cta" href="${appUrl}">Découvrir →</a>
<div class="cards">
${benefits.map(([e, t, d]) => `<div class="card"><h3>${e} ${t}</h3><p>${d}</p></div>`).join('')}
</div>
<h2>Quels animaux et produits trouver ?</h2>
<div class="cards">
${animalTypes.map(([e, t, d]) => `<div class="card"><h3>${e} ${t}</h3><p>${d}</p></div>`).join('')}
</div>
<h2>Questions fréquentes</h2>
${faq.map(([q, a]) => `<h3>${q}</h3><p>${a}</p>`).join('')}
<p>Voir aussi : <a href="${origin}/guide/acheter-mouton-tabaski-senegal">acheter un mouton de Tabaski</a> et <a href="${origin}/guide/produits-locaux-terroir-senegal">produits locaux & du terroir</a>.</p>
<a class="cta" href="${appUrl}">Découvrir →</a>`;

  return contentResponse(renderContentPage({
    origin, path: '/elevage',
    title: 'NEXUS Élevage & produits locaux — moutons, bétail et terroir au Sénégal',
    description: 'Trouvez des éleveurs et producteurs près de chez vous sur NEXUS Market : moutons de Tabaski, volaille, bétail et produits locaux du terroir sénégalais.',
    h1: 'NEXUS Élevage & produits locaux', crumbName: 'Élevage', isArticle: false,
    extraGraph: [{
      '@type': 'FAQPage',
      mainEntity: faq.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a.replace(/<[^>]+>/g, '') } })),
    }],
    bodyHtml: body,
  }));
}
