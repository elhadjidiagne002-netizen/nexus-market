// functions/covoiturage.js → /covoiturage — hub SEO covoiturage, transporteurs & colis.
import { renderContentPage, contentResponse } from './_lib/contentpage.js';

export async function onRequest({ request, env }) {
  const origin = env.SITE_URL || new URL(request.url).origin;
  const appUrl = `${origin}/?covoiturage=1`;

  const benefits = [
    ['🚗', 'Trajets entre villes', 'Publiez ou trouvez un trajet entre deux villes du Sénégal.'],
    ['📦', 'Envoi de colis', 'Certains trajets acceptent aussi des colis, à moindre coût.'],
    ['💰', 'Partagez les frais', 'Places à prix fixe par siège, défini par le conducteur.'],
    ['💬', 'Contact direct', 'Organisez le rendez-vous directement avec le conducteur ou le passager.'],
  ];
  const faq = [
    ['Comment publier un trajet ?', 'Ouvrez NEXUS Covoiturage, indiquez le départ, l’arrivée, la date, le nombre de places et le prix par place, puis publiez.'],
    ['Puis-je envoyer un colis avec un trajet ?', 'Oui, si le conducteur a activé l’option « accepter des colis » sur son trajet.'],
    ['Le service est-il disponible dans tout le Sénégal ?', 'Oui, tant qu’un trajet est publié entre les deux villes qui vous intéressent.'],
  ];

  const body = `
<h1>🚗 Covoiturage — trajets, transporteurs & colis</h1>
<p class="lead">Trouvez ou proposez un trajet entre deux villes du Sénégal, et envoyez un colis en profitant du même trajet. Simple, économique, en contact direct.</p>
<a class="cta" href="${appUrl}">Voir les trajets disponibles →</a>
<div class="cards">
${benefits.map(([e, t, d]) => `<div class="card"><h3>${e} ${t}</h3><p>${d}</p></div>`).join('')}
</div>
<h2>Questions fréquentes</h2>
${faq.map(([q, a]) => `<h3>${q}</h3><p>${a}</p>`).join('')}
<a class="cta" href="${appUrl}">Voir les trajets disponibles →</a>`;

  return contentResponse(renderContentPage({
    origin, path: '/covoiturage',
    title: 'Covoiturage au Sénégal — trajets entre villes & envoi de colis',
    description: 'NEXUS Covoiturage : trouvez ou publiez un trajet entre deux villes du Sénégal, et envoyez un colis en profitant du même trajet.',
    h1: 'Covoiturage — trajets, transporteurs & colis', crumbName: 'Covoiturage', isArticle: false,
    extraGraph: [{
      '@type': 'FAQPage',
      mainEntity: faq.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })),
    }],
    bodyHtml: body,
  }));
}
