// functions/blog/rentree-scolaire-fournitures-manuels-senegal.js
import { renderContentPage, contentResponse } from '../_lib/contentpage.js';

export async function onRequest({ request, env }) {
  const origin = env.SITE_URL || new URL(request.url).origin;
  const faq = {
    '@type': 'FAQPage',
    mainEntity: [
      { '@type': 'Question', name: 'Peut-on acheter des manuels scolaires d\'occasion sur NEXUS ?', acceptedAnswer: { '@type': 'Answer', text: 'Oui, la catégorie Sport & Loisirs regroupe aussi les manuels scolaires, souvent proposés d\'occasion à prix réduit par d\'autres parents ou étudiants.' } },
      { '@type': 'Question', name: 'Quand commencer les achats de rentrée ?', acceptedAnswer: { '@type': 'Answer', text: 'Idéalement plusieurs semaines avant la rentrée, pour éviter la rupture de stock des articles les plus demandés et les prix qui grimpent à l\'approche de la date.' } },
    ],
  };
  const body = `
<h1>Rentrée scolaire au Sénégal : où acheter fournitures et manuels moins cher</h1>
<p class="lead">Cahiers, manuels, uniformes, sacs à dos : la rentrée scolaire représente un budget conséquent pour de nombreuses familles sénégalaises. Voici comment l'anticiper et faire des économies.</p>

<div class="tldr">
<h2>À retenir</h2>
<ul>
  <li>Les manuels d'occasion permettent une économie substantielle par rapport au neuf.</li>
  <li>Anticiper les achats quelques semaines avant la rentrée évite la rupture de stock.</li>
  <li>Comparer plusieurs vendeurs avant d'acheter en grande quantité (classe entière, fratrie).</li>
</ul>
</div>

<h2>1. Manuels scolaires : neuf ou occasion ?</h2>
<p>De nombreux manuels changent peu d'une année à l'autre : acheter d'occasion auprès d'un élève de l'année précédente permet une économie importante, à condition de vérifier que l'édition correspond bien au programme en cours.</p>

<h2>2. Fournitures : anticiper pour éviter la rupture de stock</h2>
<p>Cahiers, stylos, cartables : les articles les plus demandés se raréfient et voient leur prix grimper à l'approche immédiate de la rentrée. Commencer ses achats plusieurs semaines à l'avance permet d'avoir le plus large choix au meilleur prix.</p>

<h2>3. Uniformes et tenues scolaires</h2>
<p>Pour les établissements exigeant un uniforme, comparez les vendeurs de la <a href="${origin}/categorie/mode">catégorie Mode & Vêtements</a> : certains proposent des tarifs dégressifs pour l'achat de plusieurs tenues (fratrie ou classe entière).</p>

<h2>4. Grouper les achats en famille ou entre voisins</h2>
<p>Pour les familles avec plusieurs enfants scolarisés, ou entre voisins d'un même quartier, grouper les commandes permet parfois de négocier un tarif de gros auprès du vendeur, en plus de réduire les frais de livraison.</p>

<h2>5. Vendre le matériel de l'année précédente</h2>
<p>Manuels non réutilisés, cartable en bon état, calculatrice : c'est aussi l'occasion de vendre ce qui ne sert plus. Voir notre guide <a href="${origin}/guide/reussir-annonce-photos-prix-senegal">réussir son annonce : photos & prix</a> pour vendre rapidement avant la rentrée.</p>

<a class="cta" href="${origin}/categorie/sport">Voir livres & fournitures →</a>
<p style="margin-top:1.4rem">Voir aussi : <a href="${origin}/blog">Tous les articles du blog</a> · <a href="${origin}/guides">Tous les guides</a></p>`;

  return contentResponse(renderContentPage({
    origin, path: '/blog/rentree-scolaire-fournitures-manuels-senegal',
    title: 'Rentrée scolaire au Sénégal : où acheter fournitures et manuels moins cher',
    description: 'Conseils pour bien préparer la rentrée scolaire au Sénégal : manuels d\'occasion, anticipation des achats, uniformes et achats groupés.',
    h1: 'Rentrée scolaire au Sénégal : où acheter fournitures et manuels moins cher', crumbName: 'Blog — Rentrée scolaire',
    isArticle: true, datePublished: '2026-07-06', bodyHtml: body, extraGraph: [faq],
  }));
}
