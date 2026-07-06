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
    ['Pourquoi le vendredi et pas un autre jour ?', 'Le Louma reprend la tradition des marchés hebdomadaires sénégalais, historiquement organisés un jour fixe dans chaque localité — le vendredi correspond à cette logique de rendez-vous régulier.'],
    ['Les prix du Louma sont-ils vraiment différents ?', 'Les vendeurs participants proposent des remises ou mettent en avant des offres spécifiques pour l’édition du jour ; comparez toujours avec le prix habituel affiché sur la fiche produit.'],
    ['Puis-je retrouver un article du Louma la semaine suivante ?', 'Si le vendeur maintient l’offre, oui ; sinon l’article reste disponible au catalogue à son prix normal en dehors du Louma.'],
  ];

  const origin_context = `
<h2>Le concept du Louma, du marché physique au marché en ligne</h2>
<p>Au Sénégal, un « louma » désigne un grand marché périodique, souvent hebdomadaire, où producteurs, éleveurs et commerçants se retrouvent pour échanger bétail, produits agricoles et marchandises diverses — une tradition ancrée dans de nombreuses régions du pays. NEXUS s'inspire de cet esprit de rendez-vous régulier pour créer une édition spéciale de la marketplace, chaque vendredi, où l'offre et la visibilité des vendeurs sont mises en avant.</p>`;

  const body = `
<h1>🏪 Louma — le marché en ligne</h1>
<p class="lead">Le Louma NEXUS, c’est l’esprit du marché sénégalais en ligne : chaque vendredi, une sélection spéciale de vendeurs et de bonnes affaires, à parcourir comme au vrai louma du quartier.</p>
<a class="cta" href="${appUrl}">J’en profite →</a>
<div class="cards">
${benefits.map(([e, t, d]) => `<div class="card"><h3>${e} ${t}</h3><p>${d}</p></div>`).join('')}
</div>
${origin_context}
<h2>Questions fréquentes</h2>
${faq.map(([q, a]) => `<h3>${q}</h3><p>${a}</p>`).join('')}
<p>Envie de vendre lors du prochain Louma ? Consultez notre guide <a href="${origin}/guide/vendre-sur-nexus-market">vendre sur NEXUS Market</a> pour bien démarrer.</p>
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
