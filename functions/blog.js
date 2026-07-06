// functions/blog.js → /blog — sommaire du blog (articles pratiques et actualités NEXUS).
// Distinct de /guides : les guides sont des tutoriels de référence (achat, vente,
// paiement) ; le blog couvre des sujets plus ponctuels/saisonniers et les nouveautés
// des différentes verticales (Louma, Location, Coursier…).
import { renderContentPage, contentResponse } from './_lib/contentpage.js';

export async function onRequest({ request, env }) {
  const origin = env.SITE_URL || new URL(request.url).origin;
  const articles = [
    ['/blog/tabaski-guide-complet-senegal', '🐏 Tabaski au Sénégal : budget, calendrier et préparatifs', 'Planifiez votre Tabaski sereinement : quand acheter, combien prévoir, comment organiser la fête sans stress de dernière minute.'],
    ['/blog/guide-tailles-vetements-senegal', '👕 Guide des tailles : vêtements et chaussures au Sénégal', 'Comprendre les correspondances de tailles (S/M/L, pointures) pour acheter en ligne sans mauvaise surprise.'],
    ['/blog/comment-fixer-prix-revente-objet-occasion', '💰 Comment fixer le juste prix d’un objet d’occasion', 'La méthode pour évaluer et vendre rapidement, que ce soit un meuble, un vêtement ou un appareil.'],
    ['/blog/louma-vendredi-comment-en-profiter', '🏪 Louma du vendredi : comment en profiter au maximum', 'Nos astuces pour repérer les meilleures offres de l’édition hebdomadaire de la marketplace.'],
    ['/blog/bien-annoncer-location-materiel', '🔑 Bien rédiger une annonce de location de matériel', 'Photos, prix, conditions de caution : ce qu’il faut préciser pour louer rapidement et sans litige.'],
    ['/blog/coursier-vs-transporteur-livraison', '🛵 Coursier ou transporteur : quel mode de livraison choisir ?', 'Comparatif pratique selon l’urgence, le volume et la distance de votre envoi.'],
  ];
  const body = `
<h1>Blog NEXUS Market</h1>
<p class="lead">Conseils pratiques, actualités saisonnières et astuces pour acheter, vendre et profiter au mieux de toutes les fonctionnalités de NEXUS Market au Sénégal.</p>
<div class="cards">
${articles.map(([h, t, d]) => `<a class="card" href="${origin + h}"><h3>${t}</h3><p>${d}</p></a>`).join('')}
</div>
<h2>Envie d'un tutoriel plus complet ?</h2>
<p>Retrouvez nos guides de référence sur l'achat, la vente, le paiement mobile et la livraison au Sénégal dans notre <a href="${origin}/guides">section Guides</a>.</p>
<a class="cta" href="${origin}/">Explorer la marketplace →</a>`;

  return contentResponse(renderContentPage({
    origin, path: '/blog',
    title: 'Blog NEXUS Market — conseils, astuces et actualités',
    description: 'Le blog NEXUS Market : conseils pratiques, actualités saisonnières (Tabaski, Louma) et astuces pour acheter, vendre et louer au Sénégal.',
    h1: 'Blog NEXUS Market', crumbName: 'Blog', isArticle: false, bodyHtml: body,
  }));
}
