// functions/assistant.js → /assistant — hub SEO de l'assistant IA NEXUS.
import { renderContentPage, contentResponse } from './_lib/contentpage.js';

export async function onRequest({ request, env }) {
  const origin = env.SITE_URL || new URL(request.url).origin;
  const appUrl = `${origin}/?assistant=1`;

  const benefits = [
    ['🤖', 'Décrivez votre besoin', 'En français ou en wolof, expliquez simplement ce que vous cherchez.'],
    ['🔎', 'Suggestions personnalisées', 'L’assistant IA vous propose les produits et vendeurs les plus pertinents.'],
    ['⚡', 'Réponse immédiate', 'Pas d’attente : l’assistant répond instantanément, à toute heure.'],
  ];
  const faq = [
    ['Comment utiliser l’assistant IA ?', 'Cliquez sur l’icône de l’assistant IA sur NEXUS Market et décrivez ce que vous cherchez : il vous guide vers les produits et vendeurs adaptés.'],
    ['L’assistant comprend-il le wolof ?', 'Oui, vous pouvez lui écrire en français ou en wolof selon votre préférence.'],
    ['L’assistant est-il gratuit ?', 'Oui, l’assistant IA est disponible gratuitement pour tous les visiteurs de NEXUS Market.'],
    ['L’assistant peut-il m’aider à choisir entre deux produits ?', 'Oui, décrivez votre besoin et votre budget : l’assistant compare les options disponibles et vous oriente vers les fiches les plus pertinentes.'],
    ['Mes échanges avec l’assistant sont-ils privés ?', 'Vos messages servent uniquement à générer une réponse pertinente et ne sont pas partagés publiquement.'],
    ['L’assistant peut-il remplacer le contact avec un vendeur ?', 'Non : il vous aide à trouver le bon produit, mais la négociation et les questions spécifiques restent à échanger directement avec le vendeur via la messagerie NEXUS.'],
  ];

  const examples = [
    ['« Je cherche un smartphone à moins de 100 000 FCFA »', 'L’assistant filtre le catalogue et propose les modèles correspondant à votre budget.'],
    ['« Wax bu bees ngir bitim moom »', 'L’assistant comprend le wolof et vous oriente vers les vendeurs de tissus wax pertinents.'],
    ['« Un cadeau pour un anniversaire d’enfant »', 'L’assistant suggère des idées dans les catégories jouets, mode enfant ou loisirs.'],
  ];

  const body = `
<h1>🤖 Assistant IA NEXUS</h1>
<p class="lead">Décrivez ce que vous cherchez en français ou en wolof : l’assistant IA de NEXUS Market vous guide vers les bons produits et vendeurs, instantanément.</p>
<a class="cta" href="${appUrl}">Discuter avec l’IA →</a>
<div class="cards">
${benefits.map(([e, t, d]) => `<div class="card"><h3>${e} ${t}</h3><p>${d}</p></div>`).join('')}
</div>
<h2>Exemples de questions</h2>
<div class="cards">
${examples.map(([q, a]) => `<div class="card"><h3>${q}</h3><p>${a}</p></div>`).join('')}
</div>
<h2>Pourquoi un assistant en français et en wolof ?</h2>
<p>Beaucoup d'utilisateurs sénégalais préfèrent s'exprimer en wolof pour décrire naturellement ce qu'ils recherchent. L'assistant IA de NEXUS Market comprend les deux langues, ce qui permet à chacun de formuler sa demande dans la langue la plus confortable, sans barrière technique, pour retrouver rapidement le bon produit ou le bon vendeur dans un catalogue de plusieurs milliers d'annonces.</p>
<h2>Questions fréquentes</h2>
${faq.map(([q, a]) => `<h3>${q}</h3><p>${a}</p>`).join('')}
<a class="cta" href="${appUrl}">Discuter avec l’IA →</a>`;

  return contentResponse(renderContentPage({
    origin, path: '/assistant',
    title: 'Assistant IA NEXUS Market — trouvez le bon produit en quelques mots',
    description: 'L’assistant IA de NEXUS Market vous aide à trouver le bon produit ou vendeur en français ou en wolof, avec une réponse immédiate.',
    h1: 'Assistant IA NEXUS', crumbName: 'Assistant IA', isArticle: false,
    extraGraph: [{
      '@type': 'FAQPage',
      mainEntity: faq.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })),
    }],
    bodyHtml: body,
  }));
}
