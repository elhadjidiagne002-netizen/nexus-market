// functions/louma.js → /louma — hub SEO du marché en ligne Louma (édition du vendredi).
import { renderContentPage, contentResponse } from './_lib/contentpage.js';

export async function onRequest({ request, env }) {
  const origin = env.SITE_URL || new URL(request.url).origin;
  const appUrl = `${origin}/?louma=1`;

  const benefits = [
    ['🏪', 'Le marché en ligne du vendredi', 'Chaque vendredi, retrouvez une sélection spéciale de vendeurs et de bonnes affaires.'],
    ['🔥', 'Offres exclusives', 'Des prix et promotions réservés à l’édition Louma.'],
    ['🇸🇳', 'L’esprit du marché sénégalais', 'L’ambiance et la diversité d’un vrai louma, disponible en ligne partout au Sénégal.'],
  ];
  const faq = [
    ['C’est quoi le Louma NEXUS ?', 'Le Louma est l’édition hebdomadaire (le vendredi) de la marketplace NEXUS Market, avec une sélection mise en avant de vendeurs et d’offres, à l’image des marchés traditionnels sénégalais.'],
    ['Quand le Louma est-il actif ?', 'Le Louma s’active chaque vendredi. Les autres jours, retrouvez le catalogue complet de NEXUS Market.'],
    ['Comment participer en tant que vendeur ?', 'Tout vendeur actif sur NEXUS Market peut voir ses produits mis en avant lors de l’édition Louma du vendredi.'],
  ];

  const body = `
<h1>🏪 Louma — le marché en ligne</h1>
<p class="lead">Le Louma NEXUS, c’est l’esprit du marché sénégalais en ligne : chaque vendredi, une sélection spéciale de vendeurs et de bonnes affaires, à parcourir comme au vrai louma du quartier.</p>
<a class="cta" href="${appUrl}">J’en profite →</a>
<div class="cards">
${benefits.map(([e, t, d]) => `<div class="card"><h3>${e} ${t}</h3><p>${d}</p></div>`).join('')}
</div>
<h2>Questions fréquentes</h2>
${faq.map(([q, a]) => `<h3>${q}</h3><p>${a}</p>`).join('')}
<a class="cta" href="${appUrl}">J’en profite →</a>`;

  return contentResponse(renderContentPage({
    origin, path: '/louma',
    title: 'Louma — le marché en ligne du vendredi',
    description: 'Découvrez le Louma NEXUS : l’édition hebdomadaire du vendredi avec une sélection spéciale de vendeurs et d’offres, l’esprit du marché sénégalais en ligne.',
    h1: 'Louma — le marché en ligne', crumbName: 'Louma', isArticle: false,
    extraGraph: [{
      '@type': 'FAQPage',
      mainEntity: faq.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })),
    }],
    bodyHtml: body,
  }));
}
