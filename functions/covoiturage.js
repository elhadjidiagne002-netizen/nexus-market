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
    ['Comment le prix par place est-il fixé ?', 'C’est le conducteur qui définit librement le prix par place au moment de la publication du trajet, généralement en fonction de la distance et du carburant.'],
    ['Que faire si mon trajet est annulé ?', 'Contactez directement le conducteur via la messagerie NEXUS ; en cas d’annulation tardive, recherchez un autre trajet disponible sur la même liaison.'],
    ['Puis-je réserver plusieurs places pour ma famille ?', 'Oui, indiquez le nombre de places souhaité lors de la réservation, dans la limite des places disponibles sur le trajet.'],
  ];

  const routes = [
    ['Dakar ↔ Thiès', 'La liaison la plus fréquentée, plusieurs départs quotidiens.'],
    ['Dakar ↔ Saint-Louis', 'Trajet régulier vers le nord, apprécié pour les voyages familiaux et professionnels.'],
    ['Dakar ↔ Kaolack', 'Liaison vers le centre du pays, souvent combinée à l’envoi de colis.'],
    ['Dakar ↔ Ziguinchor', 'Trajet long vers la Casamance, généralement organisé à l’avance.'],
  ];

  const body = `
<h1>🚗 Covoiturage — trajets, transporteurs & colis</h1>
<p class="lead">Trouvez ou proposez un trajet entre deux villes du Sénégal, et envoyez un colis en profitant du même trajet. Simple, économique, en contact direct.</p>
<a class="cta" href="${appUrl}">Voir les trajets disponibles →</a>
<div class="cards">
${benefits.map(([e, t, d]) => `<div class="card"><h3>${e} ${t}</h3><p>${d}</p></div>`).join('')}
</div>
<h2>Liaisons populaires</h2>
<div class="cards">
${routes.map(([t, d]) => `<div class="card"><h3>${t}</h3><p>${d}</p></div>`).join('')}
</div>
<h2>Pourquoi covoiturer au Sénégal ?</h2>
<p>Entre le coût du carburant, les tarifs des taxis interurbains et le manque de flexibilité des transports collectifs classiques, le covoiturage entre particuliers offre une alternative économique et conviviale pour se déplacer entre les grandes villes du pays. Il permet aussi de rentabiliser un trajet déjà prévu en y ajoutant des passagers ou un colis à transporter.</p>
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
