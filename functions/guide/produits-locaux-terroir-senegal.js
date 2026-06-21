// functions/guide/produits-locaux-terroir-senegal.js → /guide/produits-locaux-terroir-senegal
import { renderContentPage, contentResponse } from '../_lib/contentpage.js';

export async function onRequest({ request, env }) {
  const origin = env.SITE_URL || new URL(request.url).origin;
  const faq = {
    '@type': 'FAQPage',
    mainEntity: [
      { '@type': 'Question', name: 'Où acheter des produits locaux sénégalais en ligne ?', acceptedAnswer: { '@type': 'Answer', text: 'Sur NEXUS Market, l’espace « Local & Élevage » regroupe les produits du terroir (céréales, fruits, légumes, huiles, produits transformés) et met en avant les producteurs proches de vous.' } },
      { '@type': 'Question', name: 'Pourquoi consommer local au Sénégal ?', acceptedAnswer: { '@type': 'Answer', text: 'Acheter local soutient les producteurs et l’économie nationale, réduit les intermédiaires, garantit souvent plus de fraîcheur et valorise le savoir-faire sénégalais.' } },
    ],
  };
  const body = `
<h1>Produits locaux et du terroir : consommer sénégalais</h1>
<p class="lead">Du « Mangue Diourbel » au mil, du bissap au miel de Casamance, le Sénégal regorge de produits du terroir. Acheter local, c’est soutenir nos producteurs, manger plus frais et faire vivre l’économie nationale. Voici comment trouver et valoriser ces produits sur NEXUS Market.</p>

<h2>1. Pourquoi privilégier le local ?</h2>
<ul>
  <li><strong>Soutenir l’économie sénégalaise</strong> : chaque achat profite directement aux producteurs et transformateurs locaux.</li>
  <li><strong>Fraîcheur et qualité</strong> : circuits courts, moins d’intermédiaires, des produits de saison.</li>
  <li><strong>Valoriser le savoir-faire</strong> : céréales locales, produits transformés, artisanat alimentaire.</li>
  <li><strong>Souveraineté alimentaire</strong> : consommer ce que l’on produit, un enjeu national.</li>
</ul>

<h2>2. Des exemples de produits du terroir</h2>
<p>Le Sénégal offre une grande diversité : céréales (mil, maïs, fonio, riz de la vallée), fruits (mangue, pastèque, mangue séchée), bissap (hibiscus) et jus naturels, arachides et pâte d’arachide, huile, miel, poisson séché, fruits de mer, ainsi que de nombreux produits transformés par des coopératives et PME locales.</p>

<h2>3. Trouver les producteurs près de chez vous</h2>
<div class="box">
<p>L’espace <strong>« Local &amp; Élevage »</strong> de NEXUS met en avant le label <em>Produit local 🇸🇳</em> et permet de repérer les <strong>producteurs et éleveurs géolocalisés</strong> autour de vous. Vous contactez directement le vendeur, sans intermédiaire, et vous vous faites livrer ou vous récupérez sur place.</p>
</div>

<h2>4. Vous êtes producteur ou transformateur ?</h2>
<p>Donnez de la visibilité à vos produits auprès d’acheteurs qui veulent consommer local. Référencez vos articles avec le label local, racontez votre histoire et votre origine, et touchez une clientèle qui valorise l’authenticité. Découvrez comment <a href="${origin}/devenir-eleveur">activer votre profil producteur/éleveur</a>.</p>

<h2>5. Bien acheter ses produits frais en ligne</h2>
<ul>
  <li><strong>Vérifiez la fraîcheur</strong> et la date de récolte/production indiquée.</li>
  <li><strong>Privilégiez la proximité</strong> pour réduire le délai de livraison des produits périssables.</li>
  <li><strong>Communiquez avec le producteur</strong> sur le conditionnement et le transport.</li>
  <li><strong>Achetez de saison</strong> : meilleur goût, meilleur prix.</li>
</ul>

<a class="cta" href="${origin}/">Découvrir les produits locaux →</a>
<p style="margin-top:1.4rem">Voir aussi : <a href="${origin}/guide/acheter-mouton-tabaski-senegal">Acheter un mouton de Tabaski</a> · <a href="${origin}/guides">Tous les guides</a></p>`;

  return contentResponse(renderContentPage({
    origin, path: '/guide/produits-locaux-terroir-senegal',
    title: 'Produits locaux & du terroir au Sénégal — guide consommer local',
    description: 'Consommer local au Sénégal : pourquoi, quels produits du terroir, comment trouver les producteurs géolocalisés et bien acheter ses produits frais en ligne sur NEXUS.',
    h1: 'Produits locaux et du terroir', crumbName: 'Guide — Produits locaux',
    isArticle: true, bodyHtml: body, extraGraph: [faq],
  }));
}
