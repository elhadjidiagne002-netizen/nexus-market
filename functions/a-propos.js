// functions/a-propos.js → /a-propos
import { renderContentPage, contentResponse } from './_lib/contentpage.js';

export async function onRequest({ request, env }) {
  const origin = env.SITE_URL || new URL(request.url).origin;
  const org = {
    '@type': 'Organization',
    name: 'NEXUS Market',
    url: origin,
    logo: `${origin}/icon-512.png`,
    description: 'Marketplace en ligne sécurisée au Sénégal : achat, vente, services et livraison, avec paiement Orange Money, Wave et carte bancaire.',
    areaServed: 'SN',
    email: 'nx@nexusmarket.sn',
    sameAs: [],
  };
  const body = `
<h1>À propos de NEXUS Market</h1>
<p class="lead">NEXUS Market est une marketplace sénégalaise qui réunit, au même endroit, l’achat et la vente de produits, les services de proximité (artisans, éleveurs, coursiers) et un paiement adapté au Sénégal. Notre mission : rendre le commerce en ligne <strong>simple, sûr et accessible à tous</strong>, du grand vendeur à la personne qui n’a jamais acheté sur Internet.</p>

<h2>Notre raison d’être</h2>
<p>Le Sénégal vit une révolution numérique portée par le mobile et le paiement électronique. Pourtant, acheter en ligne reste souvent synonyme de méfiance : peur de l’arnaque, paiements en direct sans garantie, livraisons incertaines. NEXUS Market a été conçu pour lever ces freins en plaçant la <strong>confiance</strong> au centre de chaque transaction.</p>

<h2>Ce qui nous distingue</h2>
<ul>
  <li><strong>Protection acheteur</strong> : l’argent n’est versé au vendeur qu’après confirmation de réception ; les litiges sont traités sous 24 h.</li>
  <li><strong>Paiement local</strong> : Orange Money, Wave et carte bancaire, sécurisés via la plateforme.</li>
  <li><strong>Tout-en-un</strong> : produits, annonces express, services d’artisans (NEXUS Pro), élevage et produits du terroir, coursier à la demande, troc et vidéos produit (Stories).</li>
  <li><strong>Pensé pour le Sénégal</strong> : interface en Français, Wolof et Anglais, livraison à Dakar comme en régions, accessibilité audio pour le public non lettré.</li>
</ul>

<h2>Pour les acheteurs</h2>
<p>Vous accédez à un large catalogue, comparez les prix, lisez les avis et payez en toute sécurité. Votre premier achat est même garanti contre la fraude. Découvrez notre <a href="${origin}/guide/acheter-en-ligne-au-senegal">guide de l’achat en ligne</a>.</p>

<h2>Pour les vendeurs et professionnels</h2>
<p>Particuliers, commerçants, artisans, éleveurs : NEXUS vous donne une vitrine, des outils de gestion et un encaissement fiable. Lancez-vous avec le <a href="${origin}/guide/vendre-sur-nexus-market">guide du vendeur</a>, ou créez votre profil <a href="${origin}/devenir-pro">artisan</a> ou <a href="${origin}/devenir-eleveur">éleveur</a>.</p>

<h2>Notre engagement</h2>
<p>Nous croyons à un commerce numérique qui profite à l’économie locale : des revenus pour les vendeurs, des prix justes pour les acheteurs, des opportunités pour les livreurs et les artisans. Chaque fonctionnalité est pensée pour servir cet objectif, avec transparence et sans frais cachés.</p>

<h2>Qui édite ce site ?</h2>
<p>NEXUS Market est édité et exploité depuis <strong>Dakar, Sénégal</strong>. La plateforme est portée par une équipe de passionnés du numérique et du commerce local, convaincus que la technologie peut servir l’économie sénégalaise.</p>
<ul>
  <li><strong>Éditeur</strong> : NEXUS Market</li>
  <li><strong>Siège</strong> : Dakar, Sénégal</li>
  <li><strong>Immatriculation</strong> : RCCM et NINEA en cours d’obtention auprès des autorités compétentes</li>
  <li><strong>Responsable de la publication</strong> : la direction de NEXUS Market</li>
  <li><strong>Contact</strong> : <a href="mailto:elhadjidiagne002@gmail.com">elhadjidiagne002@gmail.com</a> — +221 77 625 48 95</li>
  <li><strong>Hébergement</strong> : Cloudflare, Inc.</li>
</ul>
<p>Pour le détail de vos droits et du traitement de vos données, consultez notre <a href="${origin}/confidentialite">Politique de confidentialité</a> et nos <a href="${origin}/cgu">Conditions Générales d’Utilisation</a>.</p>

<div class="box">
<p><strong>NEXUS Market</strong> — Marketplace sécurisée au Sénégal. Une question, une suggestion, un partenariat ? Écrivez-nous sur la <a href="${origin}/contact">page Contact</a>.</p>
</div>

<a class="cta" href="${origin}/">Découvrir la marketplace →</a>`;

  return contentResponse(renderContentPage({
    origin, path: '/a-propos',
    title: 'À propos de NEXUS Market — la marketplace du Sénégal',
    description: 'Qui sommes-nous ? NEXUS Market est la marketplace sécurisée du Sénégal : achat, vente, services, livraison, paiement Orange Money & Wave. Notre mission et nos valeurs.',
    h1: 'À propos de NEXUS Market', crumbName: 'À propos',
    isArticle: false, bodyHtml: body, extraGraph: [org],
  }));
}
