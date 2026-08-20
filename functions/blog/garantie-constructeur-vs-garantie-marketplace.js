// functions/blog/garantie-constructeur-vs-garantie-marketplace.js
import { renderContentPage, contentResponse } from '../_lib/contentpage.js';

export async function onRequest({ request, env }) {
  const origin = env.SITE_URL || new URL(request.url).origin;
  const faq = {
    '@type': 'FAQPage',
    mainEntity: [
      { '@type': 'Question', name: 'Un produit d\'occasion a-t-il encore sa garantie constructeur ?', acceptedAnswer: { '@type': 'Answer', text: 'Cela dépend de l\'âge du produit et de la politique de la marque — certaines garanties se transfèrent au nouveau propriétaire, d\'autres non. Demandez toujours au vendeur s\'il a la preuve d\'achat d\'origine.' } },
      { '@type': 'Question', name: 'Que couvre la protection acheteur NEXUS Market ?', acceptedAnswer: { '@type': 'Answer', text: 'Elle couvre les litiges liés à la transaction elle-même (produit non reçu, non conforme à l\'annonce) — voir notre page garantie, retour et remboursement pour le détail complet.' } },
    ],
  };
  const body = `
<h1>Garantie constructeur vs garantie marketplace : ce qu'il faut savoir</h1>
<p class="lead">Pour un achat d'électronique ou d'électroménager, deux types de garantie peuvent s'appliquer, et ils ne couvrent pas la même chose. Voici comment ne pas les confondre.</p>

<div class="tldr">
<h2>À retenir</h2>
<ul>
  <li>La garantie constructeur couvre les pannes du produit lui-même, sur une durée définie par la marque.</li>
  <li>La protection acheteur de la marketplace couvre le déroulement de la transaction (produit non reçu ou non conforme).</li>
  <li>Pour un produit d'occasion, demandez toujours la preuve d'achat d'origine si vous voulez vérifier une garantie restante.</li>
</ul>
</div>

<h2>1. La garantie constructeur</h2>
<p>Elle couvre les pannes ou défauts de fabrication du produit lui-même, pour une durée définie par la marque (souvent 1 à 2 ans pour l'électronique neuve). Pour un produit d'occasion, vérifiez si cette garantie est encore valide et transférable — demandez la preuve d'achat d'origine au vendeur.</p>

<h2>2. La protection acheteur de la marketplace</h2>
<p>Elle couvre le déroulement de votre transaction : produit non reçu, non conforme à la description, ou litige avec le vendeur. C'est une garantie différente et complémentaire à celle du fabricant — voir le détail complet sur notre page <a href="${origin}/blog/garantie-retour-remboursement-marketplace-senegal">garantie, retour et remboursement</a>.</p>

<h2>3. Bien vérifier avant d'acheter de l'électronique</h2>
<ul>
  <li>Demandez si le produit est encore sous garantie constructeur, et depuis combien de temps.</li>
  <li>Pour un achat neuf, conservez toujours votre preuve d'achat.</li>
  <li>Testez le produit dès réception pour signaler rapidement tout problème.</li>
</ul>

<a class="cta" href="${origin}/categorie/electronique">Voir les produits électroniques →</a>
<p style="margin-top:1.4rem">Voir aussi : <a href="${origin}/blog">Tous les articles du blog</a> · <a href="${origin}/blog/garantie-retour-remboursement-marketplace-senegal">Garantie, retour et remboursement</a></p>`;

  return contentResponse(renderContentPage({
    origin, path: '/blog/garantie-constructeur-vs-garantie-marketplace',
    title: 'Garantie constructeur vs garantie marketplace : ce qu\'il faut savoir',
    description: 'La différence entre garantie constructeur et protection acheteur marketplace, pour bien acheter de l\'électronique.',
    h1: 'Garantie constructeur vs garantie marketplace : ce qu\'il faut savoir', crumbName: 'Blog — Garanties',
    isArticle: true, datePublished: '2026-08-19', bodyHtml: body, extraGraph: [faq],
  }));
}
