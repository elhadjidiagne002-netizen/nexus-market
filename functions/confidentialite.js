// functions/confidentialite.js → /confidentialite
// Politique de confidentialité server-rendered + divulgation cookies publicitaires
// (Google AdSense) — EXIGENCE AdSense. Indexable.
import { renderContentPage, contentResponse } from './_lib/contentpage.js';
import { esc } from './_lib/seo.js';

const SECTIONS = [
  ['Données collectées', "Nom, prénom, adresse email, numéro de téléphone, adresse de livraison. Données de transaction (montants, dates, produits). Données de navigation (pages visitées, actions). Nous ne collectons pas de données bancaires — celles-ci sont traitées directement par notre prestataire de paiement (Stripe) et les opérateurs Mobile Money (Orange Money, Wave)."],
  ['Finalités du traitement', "Gestion des comptes et authentification. Traitement et suivi des commandes. Communication transactionnelle (confirmations, suivis). Amélioration de l’expérience utilisateur. Prévention de la fraude. Affichage de publicités et marketing (avec consentement le cas échéant)."],
  ['Base légale', "Exécution du contrat (commandes, livraisons). Intérêt légitime (sécurité, prévention de la fraude, mesure d’audience). Consentement (emails marketing, cookies publicitaires). Obligation légale (facturation, conformité fiscale sénégalaise)."],
  ['Conservation des données', "Données de compte : durée de la relation commerciale + 3 ans. Données de commandes : 10 ans (obligation comptable). Logs de connexion : 12 mois. Données marketing : 3 ans après le dernier contact."],
  ['Partage des données', "Nous ne vendons jamais vos données personnelles. Partage limité avec : les vendeurs pour l’exécution de vos commandes, nos prestataires de paiement (Stripe, Orange Money, Wave), nos services logistiques pour la livraison, nos prestataires techniques (hébergement, analytics, publicité) et les autorités sénégalaises sur demande légale."],
  ['Vos droits', "Conformément à la loi sénégalaise n°2008-12, vous disposez des droits d’accès, de rectification, d’effacement, d’opposition et de portabilité de vos données. Pour exercer ces droits, écrivez à elhadjidiagne002@gmail.com. Délai de réponse : 30 jours."],
];

export async function onRequest({ request, env }) {
  const origin = env.SITE_URL || new URL(request.url).origin;
  const body = `
<h1>Politique de Confidentialité</h1>
<p class="lead">NEXUS Market accorde une grande importance à la protection de votre vie privée. Cette politique explique quelles données nous collectons, pourquoi, et comment vous gardez le contrôle. Conforme à la loi sénégalaise n°2008-12 sur la protection des données personnelles.</p>
${SECTIONS.map(([t, x]) => `<h2>${esc(t)}</h2><p>${esc(x)}</p>`).join('\n')}

<h2>Cookies</h2>
<p>Nous utilisons des <strong>cookies fonctionnels</strong> (authentification, panier) indispensables au fonctionnement du site, ainsi que des <strong>cookies de mesure d’audience</strong> anonymisés pour améliorer nos services. Vous pouvez configurer votre navigateur pour refuser les cookies non essentiels ; certaines fonctionnalités pourraient alors être limitées.</p>

<h2>Publicité &amp; Google AdSense</h2>
<p>Ce site peut afficher des annonces publicitaires diffusées par des partenaires tiers, dont <strong>Google</strong>, via le service Google AdSense. À ce titre :</p>
<ul>
  <li>Google, en tant que fournisseur tiers, utilise des <strong>cookies</strong> pour diffuser des annonces en fonction de vos visites précédentes sur ce site et sur d’autres sites Internet.</li>
  <li>Le cookie publicitaire de Google (notamment le cookie <em>DoubleClick DART</em>) permet à Google et à ses partenaires de diffuser des annonces pertinentes aux utilisateurs.</li>
  <li>Des fournisseurs tiers et des réseaux publicitaires peuvent également utiliser des cookies ou des technologies similaires pour mesurer la performance des annonces.</li>
  <li>Vous pouvez <strong>désactiver la publicité personnalisée</strong> de Google dans les <a href="https://www.google.com/settings/ads" rel="nofollow noopener" target="_blank">paramètres des annonces Google</a>, et en savoir plus / vous désinscrire des cookies de fournisseurs tiers sur <a href="https://www.aboutads.info/choices/" rel="nofollow noopener" target="_blank">aboutads.info/choices</a> ou <a href="https://optout.networkadvertising.org/" rel="nofollow noopener" target="_blank">optout.networkadvertising.org</a>.</li>
</ul>
<p>Pour plus d’informations sur la manière dont Google utilise les données lorsque vous utilisez les sites de ses partenaires, consultez la page <a href="https://policies.google.com/technologies/partner-sites" rel="nofollow noopener" target="_blank">« Règles de confidentialité et conditions d’utilisation » de Google</a>.</p>

<h2>Sécurité</h2>
<p>Les échanges avec le site sont chiffrés (TLS/HTTPS). Nous appliquons des mesures techniques et organisationnelles raisonnables pour protéger vos données contre tout accès non autorisé.</p>

<div class="box"><strong>Contact — données personnelles :</strong> elhadjidiagne002@gmail.com — Dakar, Sénégal. Voir aussi nos <a href="${origin}/cgu">Conditions Générales d’Utilisation</a>.</div>`;

  return contentResponse(renderContentPage({
    origin, path: '/confidentialite',
    title: 'Politique de Confidentialité & cookies',
    description: 'Politique de confidentialité de NEXUS Market : données collectées, finalités, droits (loi 2008-12), cookies et publicité Google AdSense, sécurité et contact.',
    h1: 'Politique de Confidentialité', crumbName: 'Confidentialité',
    isArticle: false, bodyHtml: body,
  }));
}
