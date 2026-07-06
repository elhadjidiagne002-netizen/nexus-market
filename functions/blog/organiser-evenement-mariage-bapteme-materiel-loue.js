// functions/blog/organiser-evenement-mariage-bapteme-materiel-loue.js
import { renderContentPage, contentResponse } from '../_lib/contentpage.js';

export async function onRequest({ request, env }) {
  const origin = env.SITE_URL || new URL(request.url).origin;
  const faq = {
    '@type': 'FAQPage',
    mainEntity: [
      { '@type': 'Question', name: 'Combien de temps à l\'avance réserver le matériel événementiel ?', acceptedAnswer: { '@type': 'Answer', text: 'Au moins 2 à 3 semaines avant l\'événement, pour avoir le choix parmi plusieurs loueurs et éviter les indisponibilités de dernière minute, surtout en haute saison (mariages du week-end).' } },
      { '@type': 'Question', name: 'Peut-on louer de la vaisselle et de la décoration en plus des chaises et tables ?', acceptedAnswer: { '@type': 'Answer', text: 'Oui, de nombreuses annonces événementielles incluent vaisselle, nappage et décoration ; vérifiez ce qui est inclus dans le prix affiché.' } },
    ],
  };
  const body = `
<h1>Organiser un mariage ou un baptême avec du matériel loué</h1>
<p class="lead">Chaises, tables, sonorisation, vaisselle : organiser un événement familial ne nécessite pas d'investir dans du matériel qui ne servira qu'une fois. Voici comment bien planifier vos locations.</p>

<div class="tldr">
<h2>À retenir</h2>
<ul>
  <li>Réservez le matériel 2 à 3 semaines avant l'événement, surtout en haute saison.</li>
  <li>Listez tout ce dont vous avez besoin (chaises, tables, sonorisation, vaisselle) avant de contacter les loueurs.</li>
  <li>Comparez plusieurs annonces pour un tarif global plus avantageux qu'un loueur unique parfois plus cher.</li>
</ul>
</div>

<h2>1. Faire la liste complète du matériel nécessaire</h2>
<p>Avant de contacter le moindre loueur, listez précisément vos besoins : nombre de chaises et tables, sonorisation, vaisselle, décoration, tentes si l'événement est en extérieur. Cette liste évite les oublis de dernière minute et facilite la comparaison des offres.</p>

<h2>2. Réserver suffisamment à l'avance</h2>
<p>En haute saison (nombreux mariages le même week-end), le bon matériel se réserve vite. Contactez les loueurs de la <a href="${origin}/location">catégorie Location</a> au moins 2 à 3 semaines avant la date pour sécuriser votre réservation.</p>

<h2>3. Comparer plusieurs loueurs plutôt qu'un seul</h2>
<p>Un même loueur ne propose pas toujours tout (chaises ET sonorisation ET vaisselle) au meilleur prix : comparer plusieurs annonces permet parfois de composer un ensemble plus économique, quitte à coordonner deux ou trois livraisons différentes.</p>

<h2>4. Clarifier les conditions avant de payer</h2>
<p>Vérifiez systématiquement les conditions de caution, la date et l'heure de livraison/récupération du matériel, et l'état des lieux prévu en cas de dommage — les mêmes précautions que pour toute location, détaillées dans notre guide <a href="${origin}/blog/bien-annoncer-location-materiel">bien rédiger une annonce de location de matériel</a>.</p>

<h2>5. Prévoir une marge de sécurité</h2>
<p>Prévoyez toujours quelques chaises ou couverts supplémentaires par rapport au nombre d'invités annoncé : les imprévus (invités surprises, casse) sont fréquents lors des grands événements familiaux.</p>

<a class="cta" href="${origin}/location">Voir le matériel événementiel →</a>
<p style="margin-top:1.4rem">Voir aussi : <a href="${origin}/blog">Tous les articles du blog</a> · <a href="${origin}/guides">Tous les guides</a></p>`;

  return contentResponse(renderContentPage({
    origin, path: '/blog/organiser-evenement-mariage-bapteme-materiel-loue',
    title: 'Organiser un mariage ou un baptême avec du matériel loué',
    description: 'Comment bien planifier la location de matériel événementiel (chaises, tables, sonorisation) pour un mariage ou un baptême au Sénégal.',
    h1: 'Organiser un mariage ou un baptême avec du matériel loué', crumbName: 'Blog — Événement & location',
    isArticle: true, datePublished: '2026-07-06', bodyHtml: body, extraGraph: [faq],
  }));
}
