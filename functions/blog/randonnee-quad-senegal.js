// functions/blog/randonnee-quad-senegal.js
import { renderContentPage, contentResponse } from '../_lib/contentpage.js';

export async function onRequest({ request, env }) {
  const origin = env.SITE_URL || new URL(request.url).origin;
  const faq = {
    '@type': 'FAQPage',
    mainEntity: [
      { '@type': 'Question', name: 'Faut-il une expérience préalable pour faire du quad ?', acceptedAnswer: { '@type': 'Answer', text: 'Non, la plupart des sorties encadrées commencent par une brève initiation sur place, accessible aux débutants.' } },
      { '@type': 'Question', name: 'Quel équipement est fourni par le prestataire ?', acceptedAnswer: { '@type': 'Answer', text: 'Casque et parfois lunettes de protection sont généralement inclus — vérifiez avant de partir, notamment pour les sorties en dunes où la poussière est importante.' } },
    ],
  };
  const body = `
<h1>Randonnée en quad au Sénégal : où et comment réserver une sortie</h1>
<p class="lead">Dunes de Lompoul, littoral de la Petite Côte, environs de Dakar : le quad est une activité de plus en plus prisée pour découvrir le Sénégal autrement. Voici comment bien choisir votre sortie.</p>

<div class="tldr">
<h2>À retenir</h2>
<ul>
  <li>Vérifiez la durée du circuit et le niveau de difficulté proposé (débutant ou confirmé).</li>
  <li>Le casque est généralement inclus, mais confirmez avant de réserver.</li>
  <li>Privilégiez un prestataire qui encadre le groupe pendant toute la sortie.</li>
</ul>
</div>

<h2>1. Les types de circuits disponibles</h2>
<p>Les sorties varient entre balades courtes (environ une heure) adaptées aux débutants et circuits plus longs pour les amateurs confirmés, parfois combinés à une découverte de sites naturels (dunes, littoral). Certains prestataires proposent aussi des sorties en groupe pour un événement ou un anniversaire.</p>

<h2>2. Ce qu'il faut vérifier avant de réserver</h2>
<ul>
  <li><strong>Niveau requis</strong> : certains circuits sont réservés aux pilotes confirmés.</li>
  <li><strong>Équipement fourni</strong> : casque, lunettes de protection.</li>
  <li><strong>Encadrement</strong> : un guide accompagne-t-il le groupe pendant toute la sortie ?</li>
  <li><strong>Assurance</strong> : demandez ce qui est couvert en cas d'incident.</li>
</ul>

<h2>3. Trouver une sortie près de chez vous</h2>
<p>NEXUS Market référence des prestataires de sorties quad et aventure au Sénégal, avec leurs tarifs et zones d'activité. Consultez la <a href="${origin}/categorie/sport">catégorie Sport &amp; Loisirs</a> ou la <a href="${origin}/categorie/auto">catégorie Auto &amp; Moto</a> pour comparer les options.</p>

<a class="cta" href="${origin}/categorie/sport">Voir les sorties disponibles →</a>
<p style="margin-top:1.4rem">Voir aussi : <a href="${origin}/blog">Tous les articles du blog</a> · <a href="${origin}/blog/louer-jetski-bateau-senegal">Louer un jet-ski ou un bateau au Sénégal</a></p>`;

  return contentResponse(renderContentPage({
    origin, path: '/blog/randonnee-quad-senegal',
    title: 'Randonnée en quad au Sénégal : où et comment réserver une sortie',
    description: 'Sorties quad au Sénégal (dunes, littoral) : niveaux de circuits, équipement fourni et conseils pour bien choisir votre prestataire.',
    h1: 'Randonnée en quad au Sénégal : où et comment réserver une sortie', crumbName: 'Blog — Quad & aventure',
    isArticle: true, datePublished: '2026-08-19', bodyHtml: body, extraGraph: [faq],
  }));
}
