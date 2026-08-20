// functions/blog/ordinateur-portable-etudiant-senegal.js
import { renderContentPage, contentResponse } from '../_lib/contentpage.js';

export async function onRequest({ request, env }) {
  const origin = env.SITE_URL || new URL(request.url).origin;
  const faq = {
    '@type': 'FAQPage',
    mainEntity: [
      { '@type': 'Question', name: 'Neuf ou occasion : que choisir avec un petit budget ?', acceptedAnswer: { '@type': 'Answer', text: 'Un ordinateur d\'occasion en bon état, vérifié avant achat, offre souvent un meilleur rapport performance/prix pour un usage bureautique étudiant qu\'un neuf d\'entrée de gamme.' } },
      { '@type': 'Question', name: 'Quelle configuration minimale pour des études classiques ?', acceptedAnswer: { '@type': 'Answer', text: 'Pour de la bureautique, de la recherche et des cours en ligne, 8 Go de RAM et un stockage SSD suffisent largement — inutile de payer pour des configurations pensées pour le jeu vidéo ou le montage vidéo si ce n\'est pas votre usage.' } },
    ],
  };
  const body = `
<h1>Ordinateur portable pour étudiant au Sénégal : lequel choisir sans se ruiner</h1>
<p class="lead">Entre les modèles neufs et d'occasion, les configurations et les prix très variables, choisir un ordinateur portable pour ses études peut vite devenir compliqué. Voici comment s'y retrouver.</p>

<div class="tldr">
<h2>À retenir</h2>
<ul>
  <li>Adaptez la configuration à votre usage réel : bureautique et cours en ligne ne demandent pas une machine puissante.</li>
  <li>Un ordinateur d'occasion vérifié offre souvent un meilleur rapport qualité-prix qu'un neuf d'entrée de gamme.</li>
  <li>Vérifiez l'autonomie de la batterie, un critère souvent négligé mais important au quotidien.</li>
</ul>
</div>

<h2>1. Quelle configuration pour quel usage ?</h2>
<table>
<thead><tr><th>Usage</th><th>Configuration recommandée</th></tr></thead>
<tbody>
<tr><td>Bureautique, recherche, cours en ligne</td><td>8 Go de RAM, stockage SSD, processeur d'entrée/milieu de gamme</td></tr>
<tr><td>Design, montage léger</td><td>16 Go de RAM recommandés, carte graphique dédiée si possible</td></tr>
<tr><td>Programmation</td><td>8-16 Go de RAM selon les logiciels utilisés, SSD indispensable</td></tr>
</tbody>
</table>

<h2>2. Neuf ou occasion ?</h2>
<p>Un ordinateur d'occasion en bon état permet souvent d'obtenir une configuration plus performante que le neuf au même budget. Vérifiez l'état de la batterie, l'écran (pixels morts) et le bon fonctionnement du clavier avant d'acheter.</p>

<h2>3. Où trouver un bon ordinateur</h2>
<p>NEXUS Market référence des ordinateurs portables neufs et d'occasion dans la <a href="${origin}/categorie/informatique">catégorie Informatique</a>, avec photos et description détaillée pour chaque annonce.</p>

<a class="cta" href="${origin}/categorie/informatique">Voir les ordinateurs disponibles →</a>
<p style="margin-top:1.4rem">Voir aussi : <a href="${origin}/blog">Tous les articles du blog</a> · <a href="${origin}/blog/acheter-smartphone-occasion-senegal">Acheter un smartphone d'occasion au Sénégal</a></p>`;

  return contentResponse(renderContentPage({
    origin, path: '/blog/ordinateur-portable-etudiant-senegal',
    title: 'Ordinateur portable pour étudiant au Sénégal : lequel choisir sans se ruiner',
    description: 'Choisir un ordinateur portable pour ses études au Sénégal : configuration adaptée, neuf ou occasion, et où bien acheter.',
    h1: 'Ordinateur portable pour étudiant au Sénégal : lequel choisir sans se ruiner', crumbName: 'Blog — Ordinateur étudiant',
    isArticle: true, datePublished: '2026-08-19', bodyHtml: body, extraGraph: [faq],
  }));
}
