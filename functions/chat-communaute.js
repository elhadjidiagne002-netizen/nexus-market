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
    ['Le chat communauté remplace-t-il la messagerie privée avec un vendeur ?', 'Non, c’est un espace public d’échange général ; pour négocier un achat précis, utilisez la messagerie privée depuis la fiche du vendeur.'],
    ['Faut-il un compte pour lire le chat ?', 'La lecture est ouverte à tous les visiteurs ; un compte est nécessaire pour participer aux discussions.'],
    ['Quels sujets peut-on aborder dans le chat ?', 'Bons plans, questions sur la livraison ou le paiement, retours d’expérience, conseils entre acheteurs et vendeurs — toujours dans le respect des règles de la communauté.'],
  ];

  const topics = [
    ['💡', 'Bons plans', 'Repérez les meilleures offres partagées par la communauté.'],
    ['🛠️', 'Entraide pratique', 'Questions sur le paiement, la livraison ou l’utilisation de l’application.'],
    ['⭐', 'Retours d’expérience', 'Avis et conseils entre acheteurs sur des vendeurs ou des produits.'],
  ];

  const body = `
<h1>💬 Chat communauté NEXUS</h1>
<p class="lead">Rejoignez la discussion en direct avec la communauté NEXUS Market : échangez, posez vos questions et partagez vos bons plans avec d’autres acheteurs et vendeurs sénégalais.</p>
<a class="cta" href="${appUrl}">Rejoindre la discussion →</a>
<div class="cards">
${benefits.map(([e, t, d]) => `<div class="card"><h3>${e} ${t}</h3><p>${d}</p></div>`).join('')}
</div>
<h2>De quoi parle-t-on dans le chat ?</h2>
<div class="cards">
${topics.map(([e, t, d]) => `<div class="card"><h3>${e} ${t}</h3><p>${d}</p></div>`).join('')}
</div>
<h2>Une communauté modérée</h2>
<p>Le chat communauté NEXUS Market est un espace ouvert mais surveillé : les messages inappropriés, publicitaires abusifs ou frauduleux sont modérés pour garder un lieu d'échange utile et sûr pour tous les utilisateurs, qu'ils soient acheteurs occasionnels ou vendeurs réguliers.</p>
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
