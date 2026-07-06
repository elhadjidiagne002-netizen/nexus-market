// functions/fidelite.js → /fidelite — hub SEO du programme de fidélité NEXUS.
import { renderContentPage, contentResponse } from './_lib/contentpage.js';

export async function onRequest({ request, env }) {
  const origin = env.SITE_URL || new URL(request.url).origin;
  const appUrl = `${origin}/?loyalty=1`;

  const tiers = [
    ['🥉', 'Bronze', '0 – 999 pts', '1 pt par euro dépensé · ventes flash 1h avant'],
    ['🥈', 'Argent', '1 000 – 4 999 pts', '1,5 pt par euro · livraison gratuite dès 10 000 FCFA · ventes flash 2h avant'],
    ['🥇', 'Or', '5 000+ pts', 'Avantages premium et accès prioritaire aux meilleures offres'],
  ];
  const faq = [
    ['Comment gagner des points de fidélité ?', 'Chaque achat sur NEXUS Market vous rapporte des points, selon le montant dépensé et votre palier actuel.'],
    ['Comment consulter mes points ?', 'Connectez-vous à votre compte NEXUS Market : votre solde de points s’affiche en haut de l’écran.'],
    ['Les points expirent-ils ?', 'Les points restent valables tant que votre compte est actif. Utilisez-les pour profiter des avantages de votre palier.'],
  ];

  const body = `
<h1>⭐ Programme de fidélité NEXUS</h1>
<p class="lead">Chaque achat sur NEXUS Market vous rapporte des points. Plus vous cumulez, plus vos avantages augmentent : accès anticipé aux ventes flash, livraison gratuite et bien plus.</p>
<a class="cta" href="${appUrl}">Voir mes points →</a>
<div class="cards">
${tiers.map(([e, t, r, d]) => `<div class="card"><h3>${e} ${t}</h3><p><strong>${r}</strong><br>${d}</p></div>`).join('')}
</div>
<h2>Questions fréquentes</h2>
${faq.map(([q, a]) => `<h3>${q}</h3><p>${a}</p>`).join('')}
<a class="cta" href="${appUrl}">Voir mes points →</a>`;

  return contentResponse(renderContentPage({
    origin, path: '/fidelite',
    title: 'Programme de fidélité NEXUS Market — gagnez des points à chaque achat',
    description: 'Le programme de fidélité NEXUS Market : gagnez des points à chaque achat et débloquez des avantages (livraison gratuite, ventes flash en avant-première).',
    h1: 'Programme de fidélité NEXUS', crumbName: 'Fidélité', isArticle: false,
    extraGraph: [{
      '@type': 'FAQPage',
      mainEntity: faq.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })),
    }],
    bodyHtml: body,
  }));
}
