// functions/contact.js → /contact
import { renderContentPage, contentResponse } from './_lib/contentpage.js';

export async function onRequest({ request, env }) {
  const origin = env.SITE_URL || new URL(request.url).origin;
  const email = env.ADMIN_EMAIL || 'nx@nexusmarket.sn';
  const contactPage = {
    '@type': 'ContactPage',
    name: 'Contact — NEXUS Market',
    url: `${origin}/contact`,
    inLanguage: 'fr',
  };
  const body = `
<h1>Nous contacter</h1>
<p class="lead">Une question sur une commande, un problème de paiement ou de livraison, une idée de partenariat ? L’équipe NEXUS Market est là pour vous aider. Voici comment nous joindre.</p>

<h2>Support client</h2>
<p>Pour toute question liée à une commande (paiement, livraison, litige, remboursement), le plus rapide est d’ouvrir l’assistance depuis votre compte : vous y retrouvez l’historique de vos commandes et pouvez démarrer un litige en un clic. Les litiges sont traités sous <strong>24 h</strong>.</p>
<ul>
  <li><strong>E-mail</strong> : <a href="mailto:${email}">${email}</a></li>
  <li><strong>Messagerie intégrée</strong> : disponible dans votre tableau de bord, une fois connecté.</li>
  <li><strong>Centre d’aide</strong> : consultez d’abord notre <a href="${origin}/faq">FAQ</a>, qui répond aux questions les plus fréquentes.</li>
</ul>

<h2>Vendeurs & professionnels</h2>
<p>Vous souhaitez ouvrir une boutique, référencer votre activité d’artisan ou d’éleveur, ou discuter d’un partenariat ? Commencez par nos guides — <a href="${origin}/guide/vendre-sur-nexus-market">vendre sur NEXUS</a>, <a href="${origin}/devenir-pro">devenir artisan</a>, <a href="${origin}/devenir-eleveur">devenir éleveur</a> — puis écrivez-nous par e-mail pour toute demande spécifique.</p>

<h2>Signaler un problème ou un abus</h2>
<p>La sécurité de la communauté est une priorité. Si vous repérez une annonce frauduleuse, un contenu inapproprié ou un comportement suspect, signalez-le par e-mail à <a href="mailto:${email}">${email}</a> en précisant le lien concerné. Nous traitons chaque signalement avec attention.</p>

<h2>Presse & partenariats</h2>
<p>Pour les demandes presse, institutionnelles ou commerciales, contactez-nous à <a href="mailto:${email}">${email}</a> en indiquant l’objet de votre demande ; nous reviendrons vers vous dans les meilleurs délais.</p>

<div class="box">
<p><strong>Astuce :</strong> avant de nous écrire, vérifiez notre <a href="${origin}/faq">FAQ</a> et nos <a href="${origin}/guides">guides</a> — la réponse à votre question s’y trouve peut-être déjà.</p>
</div>

<a class="cta" href="${origin}/">Retour à la marketplace →</a>`;

  return contentResponse(renderContentPage({
    origin, path: '/contact',
    title: 'Contact — joindre l’équipe NEXUS Market',
    description: 'Contactez NEXUS Market : support client, e-mail, messagerie intégrée, aide aux vendeurs, signalement d’abus, presse et partenariats au Sénégal.',
    h1: 'Nous contacter', crumbName: 'Contact',
    isArticle: false, bodyHtml: body, extraGraph: [contactPage],
  }));
}
