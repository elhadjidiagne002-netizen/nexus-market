// functions/blog/payer-carte-bancaire-en-ligne-securite-senegal.js
import { renderContentPage, contentResponse } from '../_lib/contentpage.js';

export async function onRequest({ request, env }) {
  const origin = env.SITE_URL || new URL(request.url).origin;
  const faq = {
    '@type': 'FAQPage',
    mainEntity: [
      { '@type': 'Question', name: 'Comment savoir si un site est sécurisé pour payer par carte ?', acceptedAnswer: { '@type': 'Answer', text: 'Vérifiez que l\'adresse commence par "https" (cadenas dans le navigateur) et que le paiement passe par un prestataire reconnu (Stripe, Visa/Mastercard sécurisé 3D Secure) plutôt que par un simple formulaire du site marchand.' } },
      { '@type': 'Question', name: 'Qu\'est-ce que la vérification 3D Secure ?', acceptedAnswer: { '@type': 'Answer', text: 'C\'est une étape de confirmation supplémentaire (code reçu par SMS ou validation dans l\'application bancaire) qui protège contre l\'utilisation frauduleuse de votre carte, même si son numéro a été compromis.' } },
    ],
  };
  const body = `
<h1>Payer par carte bancaire en ligne au Sénégal : est-ce sécurisé ?</h1>
<p class="lead">Le paiement par carte bancaire se développe au Sénégal, mais beaucoup d'acheteurs restent prudents. Voici comment vérifier qu'un paiement en ligne est réellement sécurisé.</p>

<div class="tldr">
<h2>À retenir</h2>
<ul>
  <li>Un site sécurisé utilise "https" et redirige vers un prestataire de paiement reconnu, pas un simple formulaire maison.</li>
  <li>La vérification 3D Secure (code SMS ou validation bancaire) est un signe de sérieux.</li>
  <li>Ne communiquez jamais les codes de votre carte par téléphone ou message, même à un "vendeur" insistant.</li>
</ul>
</div>

<h2>1. Les signes d'un paiement sécurisé</h2>
<ul>
  <li><strong>Adresse en "https"</strong> avec le cadenas visible dans le navigateur.</li>
  <li><strong>Redirection vers un prestataire de paiement reconnu</strong> plutôt qu'un simple champ de saisie sur le site marchand.</li>
  <li><strong>Vérification 3D Secure</strong> demandée au moment du paiement.</li>
  <li><strong>Aucune demande de code confidentiel</strong> par téléphone, SMS ou message : ce sont des signaux d'arnaque.</li>
</ul>

<h2>2. Carte bancaire, Orange Money ou Wave : que choisir ?</h2>
<p>Les trois moyens sont sécurisés lorsqu'ils passent par un circuit reconnu. La carte bancaire est pratique pour les paiements internationaux, tandis que Orange Money et Wave restent les réflexes les plus répandus localement — voir notre comparatif <a href="${origin}/blog/orange-money-vs-wave-senegal">Orange Money vs Wave</a>.</p>

<h2>3. La protection acheteur NEXUS Market</h2>
<p>Sur NEXUS Market, les paiements par carte, Orange Money ou Wave passent par des circuits sécurisés, avec une protection acheteur en cas de litige — voir notre page <a href="${origin}/blog/garantie-retour-remboursement-marketplace-senegal">garantie, retour et remboursement</a> pour le détail.</p>

<a class="cta" href="${origin}/">Découvrir NEXUS Market →</a>
<p style="margin-top:1.4rem">Voir aussi : <a href="${origin}/blog">Tous les articles du blog</a> · <a href="${origin}/blog/eviter-arnaques-achats-en-ligne-senegal">Éviter les arnaques en ligne</a></p>`;

  return contentResponse(renderContentPage({
    origin, path: '/blog/payer-carte-bancaire-en-ligne-securite-senegal',
    title: 'Payer par carte bancaire en ligne au Sénégal : est-ce sécurisé ?',
    description: 'Comment reconnaître un paiement par carte bancaire sécurisé en ligne au Sénégal, et les signaux d\'alerte à ne pas ignorer.',
    h1: 'Payer par carte bancaire en ligne au Sénégal : est-ce sécurisé ?', crumbName: 'Blog — Paiement sécurisé',
    isArticle: true, datePublished: '2026-08-19', bodyHtml: body, extraGraph: [faq],
  }));
}
