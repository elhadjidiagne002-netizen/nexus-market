// functions/blog/assurance-vehicule-senegal-ce-qu-il-faut-savoir.js
import { renderContentPage, contentResponse } from '../_lib/contentpage.js';

export async function onRequest({ request, env }) {
  const origin = env.SITE_URL || new URL(request.url).origin;
  const faq = {
    '@type': 'FAQPage',
    mainEntity: [
      { '@type': 'Question', name: 'L\'assurance auto est-elle obligatoire au Sénégal ?', acceptedAnswer: { '@type': 'Answer', text: 'Oui, l\'assurance responsabilité civile (au tiers minimum) est obligatoire pour circuler légalement, quel que soit le véhicule.' } },
      { '@type': 'Question', name: 'Quelle différence entre assurance au tiers et tous risques ?', acceptedAnswer: { '@type': 'Answer', text: 'L\'assurance au tiers couvre les dommages causés à autrui, tandis que la formule tous risques couvre aussi votre propre véhicule en cas d\'accident responsable, de vol ou d\'incendie.' } },
    ],
  };
  const body = `
<h1>Assurance véhicule au Sénégal : ce qu'il faut savoir avant de conduire</h1>
<p class="lead">Que vous achetiez un véhicule neuf, d'occasion ou en location, l'assurance est une étape incontournable. Voici l'essentiel à connaître.</p>

<div class="tldr">
<h2>À retenir</h2>
<ul>
  <li>L'assurance au tiers est obligatoire pour tout véhicule circulant au Sénégal.</li>
  <li>La formule tous risques protège aussi votre propre véhicule, pas seulement les tiers.</li>
  <li>Pour un véhicule loué, vérifiez toujours ce que couvre l'assurance incluse par l'agence.</li>
</ul>
</div>

<h2>1. Les formules d'assurance</h2>
<table>
<thead><tr><th>Formule</th><th>Ce qui est couvert</th></tr></thead>
<tbody>
<tr><td>Au tiers (obligatoire)</td><td>Dommages causés à autrui uniquement</td></tr>
<tr><td>Tous risques</td><td>Dommages à autrui + à votre propre véhicule (accident, vol, incendie)</td></tr>
</tbody>
</table>

<h2>2. Pour un achat d'occasion</h2>
<p>Vérifiez que le véhicule que vous achetez n'a pas d'antécédent d'assurance impayée ou de sinistre non déclaré — demandez les documents au vendeur avant de finaliser l'achat. Voir notre guide <a href="${origin}/blog/bien-choisir-voiture-occasion-senegal">bien choisir sa voiture d'occasion</a> pour les autres vérifications essentielles.</p>

<h2>3. Pour une location</h2>
<p>Les agences de location incluent généralement une assurance de base — demandez précisément ce qui est couvert et ce qui reste à votre charge en cas d'incident, avant de prendre le volant. Voir notre guide <a href="${origin}/blog/location-voiture-senegal-agences-prix">location de voiture : agences, prix et conseils</a>.</p>

<a class="cta" href="${origin}/categorie/auto">Voir les véhicules disponibles →</a>
<p style="margin-top:1.4rem">Voir aussi : <a href="${origin}/blog">Tous les articles du blog</a> · <a href="${origin}/blog/pieces-detachees-auto-senegal-neuf-occasion">Pièces détachées auto : neuves vs occasion</a></p>`;

  return contentResponse(renderContentPage({
    origin, path: '/blog/assurance-vehicule-senegal-ce-qu-il-faut-savoir',
    title: 'Assurance véhicule au Sénégal : ce qu\'il faut savoir avant de conduire',
    description: 'Assurance auto obligatoire, formules au tiers et tous risques : l\'essentiel à savoir avant d\'acheter ou de louer un véhicule au Sénégal.',
    h1: 'Assurance véhicule au Sénégal : ce qu\'il faut savoir avant de conduire', crumbName: 'Blog — Assurance véhicule',
    isArticle: true, datePublished: '2026-08-19', bodyHtml: body, extraGraph: [faq],
  }));
}
