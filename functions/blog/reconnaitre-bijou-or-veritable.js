// functions/blog/reconnaitre-bijou-or-veritable.js
import { renderContentPage, contentResponse } from '../_lib/contentpage.js';

export async function onRequest({ request, env }) {
  const origin = env.SITE_URL || new URL(request.url).origin;
  const faq = {
    '@type': 'FAQPage',
    mainEntity: [
      { '@type': 'Question', name: 'Comment lire le poinçon d\'un bijou en or ?', acceptedAnswer: { '@type': 'Answer', text: 'Le poinçon indique généralement le titre de l\'or (18 carats, 750 millièmes par exemple) ; il se trouve souvent sur le fermoir pour un collier ou à l\'intérieur d\'une bague.' } },
      { '@type': 'Question', name: 'Un bijou sans poinçon est-il forcément faux ?', acceptedAnswer: { '@type': 'Answer', text: 'Pas nécessairement, mais l\'absence de poinçon doit inciter à la prudence et à demander davantage de garanties au vendeur avant l\'achat.' } },
    ],
  };
  const body = `
<h1>Comment reconnaître un bijou en or véritable avant l'achat</h1>
<p class="lead">Bagues, colliers, boucles d'oreilles : l'or reste une valeur sûre au Sénégal, mais encore faut-il s'assurer de son authenticité avant de payer. Voici les vérifications de base à effectuer.</p>

<div class="tldr">
<h2>À retenir</h2>
<ul>
  <li>Cherchez le poinçon indiquant le titre de l'or (750 pour 18 carats, par exemple).</li>
  <li>Un bijou en or véritable ne réagit pas au test de l'aimant.</li>
  <li>En cas de doute sur une pièce de valeur, une vérification chez un bijoutier professionnel reste la solution la plus fiable.</li>
</ul>
</div>

<h2>1. Chercher le poinçon</h2>
<p>La plupart des bijoux en or véritable portent un poinçon indiquant le titre du métal : 750 millièmes pour de l'or 18 carats, 375 pour de l'or 9 carats, par exemple. Ce poinçon se situe généralement sur le fermoir d'un collier ou à l'intérieur d'une bague.</p>

<h2>2. Le test de l'aimant</h2>
<p>L'or n'est pas magnétique : si un bijou est fortement attiré par un aimant, il contient probablement d'autres métaux en quantité significative. Ce test simple ne remplace pas une expertise professionnelle, mais permet un premier repérage rapide.</p>

<h2>3. Observer la couleur et l'usure</h2>
<p>Un bijou plaqué or perd souvent sa couleur dorée aux endroits de frottement (fermoir, intérieur de bague), révélant le métal de base en dessous. Un bijou en or massif garde une teinte homogène sur toute sa surface.</p>

<h2>4. Demander une facture ou un certificat</h2>
<p>Pour un achat de valeur, demandez systématiquement une facture détaillée précisant le poids et le titre de l'or. C'est votre meilleure garantie en cas de contestation ultérieure sur l'authenticité de la pièce.</p>

<h2>5. En cas de doute</h2>
<p>Pour une pièce de valeur importante, faire vérifier le bijou par un bijoutier professionnel avant l'achat reste la solution la plus sûre, surtout si le vendeur ne peut fournir ni poinçon ni facture claire.</p>

<a class="cta" href="${origin}/categorie/mode">Découvrir bijoux & accessoires →</a>
<p style="margin-top:1.4rem">Voir aussi : <a href="${origin}/blog">Tous les articles du blog</a> · <a href="${origin}/guide/eviter-arnaques-achats-en-ligne-senegal">Éviter les arnaques en ligne</a></p>`;

  return contentResponse(renderContentPage({
    origin, path: '/blog/reconnaitre-bijou-or-veritable',
    title: 'Comment reconnaître un bijou en or véritable avant l\'achat',
    description: 'Les vérifications de base pour reconnaître un bijou en or véritable avant l\'achat : poinçon, test de l\'aimant, usure et facture.',
    h1: 'Comment reconnaître un bijou en or véritable avant l\'achat', crumbName: 'Blog — Bijou en or',
    isArticle: true, datePublished: '2026-07-06', bodyHtml: body, extraGraph: [faq],
  }));
}
