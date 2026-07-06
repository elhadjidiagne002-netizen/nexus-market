// functions/chat-communaute.js → /chat-communaute — hub SEO du chat communautaire NEXUS.
import { renderContentPage, contentResponse } from './_lib/contentpage.js';

export async function onRequest({ request, env }) {
  const origin = env.SITE_URL || new URL(request.url).origin;
  const appUrl = `${origin}/?chat=1`;

  const benefits = [
    ['💬', 'Échangez en direct', 'Discutez en temps réel avec la communauté d’acheteurs et de vendeurs NEXUS.'],
    ['🤝', 'Conseils entre utilisateurs', 'Posez vos questions, partagez vos bons plans et vos retours d’expérience.'],
    ['🇸🇳', 'Une communauté sénégalaise', 'Le chat communautaire de la marketplace du Sénégal.'],
  ];
  const faq = [
    ['Comment accéder au chat communauté ?', 'Cliquez sur l’icône de chat en bas de l’écran sur NEXUS Market pour rejoindre la discussion en direct.'],
    ['Le chat communauté est-il gratuit ?', 'Oui, il est accessible gratuitement à tous les utilisateurs de NEXUS Market.'],
    ['Puis-je signaler un message inapproprié ?', 'Oui, un modérateur surveille les échanges et tout message inapproprié peut être signalé.'],
  ];

  const body = `
<h1>💬 Chat communauté NEXUS</h1>
<p class="lead">Rejoignez la discussion en direct avec la communauté NEXUS Market : échangez, posez vos questions et partagez vos bons plans avec d’autres acheteurs et vendeurs sénégalais.</p>
<a class="cta" href="${appUrl}">Rejoindre la discussion →</a>
<div class="cards">
${benefits.map(([e, t, d]) => `<div class="card"><h3>${e} ${t}</h3><p>${d}</p></div>`).join('')}
</div>
<h2>Questions fréquentes</h2>
${faq.map(([q, a]) => `<h3>${q}</h3><p>${a}</p>`).join('')}
<a class="cta" href="${appUrl}">Rejoindre la discussion →</a>`;

  return contentResponse(renderContentPage({
    origin, path: '/chat-communaute',
    title: 'Chat communauté NEXUS Market — échangez avec les acheteurs et vendeurs',
    description: 'Rejoignez le chat communautaire de NEXUS Market : échangez en direct avec la communauté d’acheteurs et de vendeurs du Sénégal.',
    h1: 'Chat communauté NEXUS', crumbName: 'Chat communauté', isArticle: false,
    extraGraph: [{
      '@type': 'FAQPage',
      mainEntity: faq.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })),
    }],
    bodyHtml: body,
  }));
}
