// functions/blog/garantie-retour-remboursement-marketplace-senegal.js
import { renderContentPage, contentResponse } from '../_lib/contentpage.js';

export async function onRequest({ request, env }) {
  const origin = env.SITE_URL || new URL(request.url).origin;
  const faq = {
    '@type': 'FAQPage',
    mainEntity: [
      { '@type': 'Question', name: 'Sous quel délai puis-je retourner un article ?', acceptedAnswer: { '@type': 'Answer', text: 'La garantie « satisfait ou remboursé » de NEXUS Market s\'applique sous 30 jours, à condition que l\'article n\'ait pas été utilisé.' } },
      { '@type': 'Question', name: 'Que faire si mon colis n\'arrive jamais ?', acceptedAnswer: { '@type': 'Answer', text: 'Ouvrez un litige depuis « Mes commandes » : votre paiement reste protégé jusqu\'à confirmation de la bonne réception, et un conseiller NEXUS examine la situation sous 24h.' } },
    ],
  };
  const body = `
<h1>Garantie, retour et remboursement : ce qu'il faut savoir en achetant sur une marketplace</h1>
<p class="lead">Contrairement à un achat en boutique physique, un achat en ligne repose sur la confiance dans la plateforme. Voici ce que couvre réellement la protection acheteur NEXUS Market, et comment l'utiliser en cas de problème.</p>

<div class="tldr">
<h2>À retenir</h2>
<ul>
  <li>Votre paiement n'est versé au vendeur qu'après confirmation de la bonne réception.</li>
  <li>Un retour est possible sous 30 jours si l'article n'a pas été utilisé.</li>
  <li>En cas de litige, un conseiller NEXUS examine la situation sous 24h.</li>
</ul>
</div>

<h2>1. Le principe de la protection acheteur</h2>
<p>Sur NEXUS Market, l'argent versé par l'acheteur est sécurisé par la plateforme et n'est reversé au vendeur qu'après confirmation que la commande a bien été reçue et correspond à ce qui était annoncé. Ce mécanisme protège contre les vendeurs qui encaisseraient sans jamais livrer.</p>

<h2>2. Le retour sous 30 jours</h2>
<p>Si un article ne convient pas ou ne correspond pas à sa description, la garantie « satisfait ou remboursé » permet un retour sous 30 jours, à condition que l'article n'ait pas été utilisé ou porté. Les modalités précises se gèrent depuis « Mes commandes ».</p>

<h2>3. Le « Premier achat garanti »</h2>
<p>Pour rassurer les nouveaux utilisateurs, NEXUS propose une garantie renforcée sur la toute première commande payée : en cas de fraude avérée, un remboursement intégral est possible sous réserve d'une réclamation sous 48h. Voir notre <a href="${origin}/faq">FAQ complète</a> pour les conditions détaillées.</p>

<h2>4. Comment ouvrir un litige</h2>
<p>Si une commande pose problème (article non conforme, non-livraison), le bouton « Litige » depuis la commande concernée dans « Mes commandes » déclenche l'examen par un conseiller NEXUS, généralement sous 24h.</p>

<h2>5. Éviter les problèmes en amont</h2>
<p>La meilleure protection reste la prévention : lisez attentivement la description et les photos avant d'acheter, et méfiez-vous des offres trop belles pour être vraies — voir notre guide <a href="${origin}/guide/eviter-arnaques-achats-en-ligne-senegal">éviter les arnaques en ligne</a> pour les réflexes essentiels.</p>

<a class="cta" href="${origin}/faq">Consulter la FAQ complète →</a>
<p style="margin-top:1.4rem">Voir aussi : <a href="${origin}/blog">Tous les articles du blog</a> · <a href="${origin}/guides">Tous les guides</a></p>`;

  return contentResponse(renderContentPage({
    origin, path: '/blog/garantie-retour-remboursement-marketplace-senegal',
    title: 'Garantie, retour et remboursement sur une marketplace au Sénégal',
    description: 'Ce que couvre la protection acheteur NEXUS Market : paiement sécurisé, retour sous 30 jours, premier achat garanti et gestion des litiges.',
    h1: 'Garantie, retour et remboursement : ce qu\'il faut savoir en achetant sur une marketplace', crumbName: 'Blog — Garantie & retours',
    isArticle: true, datePublished: '2026-07-06', bodyHtml: body, extraGraph: [faq],
  }));
}
