// functions/blog/choisir-ligne-transport-bus-car-ferry-senegal.js
import { renderContentPage, contentResponse } from '../_lib/contentpage.js';

export async function onRequest({ request, env }) {
  const origin = env.SITE_URL || new URL(request.url).origin;
  const faq = {
    '@type': 'FAQPage',
    mainEntity: [
      { '@type': 'Question', name: 'Faut-il réserver à l\'avance pour un trajet en car au Sénégal ?', acceptedAnswer: { '@type': 'Answer', text: 'Pour les longs trajets (Dakar-Ziguinchor, Dakar-Kédougou…) et les périodes de forte affluence (Tabaski, Magal), oui — plusieurs jours à l\'avance selon la ligne. Pour des trajets courts et fréquents, une réservation le jour même suffit souvent.' } },
      { '@type': 'Question', name: 'Quelle est la différence entre un bus, un car et un 7-places ?', acceptedAnswer: { '@type': 'Answer', text: 'Le bus (type Dakar Dem Dikk) suit des horaires fixes sur de grandes lignes. Le car/minibus dessert souvent plus de villes intermédiaires. Le 7-places part généralement dès qu\'il est complet, plus flexible mais moins prévisible en horaire.' } },
      { '@type': 'Question', name: 'Le prix du bagage est-il inclus dans le billet ?', acceptedAnswer: { '@type': 'Answer', text: 'Pas toujours — de nombreux opérateurs facturent un supplément bagage au-delà d\'un certain poids. Vérifiez cette information avant de partir, surtout pour un déménagement ou un gros colis.' } },
    ],
  };
  const body = `
<h1>Bus, car ou ferry : comment bien choisir sa ligne de transport au Sénégal</h1>
<p class="lead">Dakar Dem Dikk, cars rapides, 7-places, ferry vers la Casamance : le Sénégal a un réseau de transport interurbain riche mais parfois difficile à s'y retrouver quand on ne le connaît pas. Voici comment comparer les options avant de réserver.</p>

<div class="tldr">
<h2>À retenir</h2>
<ul>
  <li>Comparez toujours durée, prix et horaires réels avant de choisir une ligne — ils varient beaucoup d'un opérateur à l'autre pour un même trajet.</li>
  <li>Le prix affiché n'inclut pas toujours les bagages : vérifiez avant de partir.</li>
  <li>Pour les trajets longue distance (Ziguinchor, Kédougou, Tambacounda), réservez à l'avance, surtout en période de forte affluence.</li>
</ul>
</div>

<h2>1. Les différents types de transport interurbain</h2>
<table>
<thead><tr><th>Type</th><th>Avantages</th><th>À prévoir</th></tr></thead>
<tbody>
<tr><td>Bus (Dakar Dem Dikk, compagnies privées)</td><td>Horaires fixes, souvent climatisé</td><td>Réservation recommandée sur les grandes lignes</td></tr>
<tr><td>Car / minibus</td><td>Dessert plus de villes intermédiaires</td><td>Durée parfois plus longue (arrêts multiples)</td></tr>
<tr><td>7-places</td><td>Flexible, départs fréquents</td><td>Part quand il est complet — horaire non garanti</td></tr>
<tr><td>Ferry (Dakar-Ziguinchor)</td><td>Confortable pour un long trajet, cabines disponibles</td><td>Fréquence limitée (quelques départs par semaine)</td></tr>
</tbody>
</table>

<h2>2. Comparer avant de réserver</h2>
<p>Pour une même destination, plusieurs opérateurs coexistent souvent avec des prix, durées et horaires de départ différents. Un trajet Dakar-Thiès, par exemple, peut se faire en un peu plus d'une heure avec plusieurs départs quotidiens selon la compagnie. Prenez le temps de comparer avant de vous engager, surtout pour un trajet régulier.</p>

<h2>3. Ce qu'il faut vérifier avant de partir</h2>
<ul>
  <li><strong>Le point de départ exact</strong> : gare routière, station précise — certaines villes ont plusieurs gares selon la compagnie.</li>
  <li><strong>Les arrêts intermédiaires</strong> : utile si vous devez descendre en cours de route.</li>
  <li><strong>Le supplément bagage</strong> : souvent facturé à part, surtout au-delà de 20 kg.</li>
  <li><strong>Le mode de réservation</strong> : téléphone, application, ou uniquement sur place selon l'opérateur.</li>
</ul>

<h2>4. Trouver la ligne qui vous convient</h2>
<p>NEXUS Market référence les lignes de transport régulières au Sénégal (bus, car, ferry, VTC longue distance) avec leurs tarifs, horaires et contacts directs, dans notre section <a href="${origin}/covoiturage">Covoiturage &amp; transport</a>. Vous y trouverez aussi bien les grandes compagnies que des lignes plus locales.</p>

<a class="cta" href="${origin}/covoiturage">Voir les lignes disponibles →</a>
<p style="margin-top:1.4rem">Voir aussi : <a href="${origin}/blog">Tous les articles du blog</a> · <a href="${origin}/blog/coursier-vs-transporteur-livraison">Coursier ou transporteur : quel mode de livraison choisir ?</a></p>`;

  return contentResponse(renderContentPage({
    origin, path: '/blog/choisir-ligne-transport-bus-car-ferry-senegal',
    title: 'Bus, car ou ferry : comment bien choisir sa ligne de transport au Sénégal',
    description: 'Comparer les lignes de bus, car, 7-places et ferry au Sénégal : prix, horaires, bagages et conseils pour bien réserver son trajet.',
    h1: 'Bus, car ou ferry : comment bien choisir sa ligne de transport au Sénégal', crumbName: 'Blog — Transport interurbain',
    isArticle: true, datePublished: '2026-08-19', bodyHtml: body, extraGraph: [faq],
  }));
}
