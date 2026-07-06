// functions/blog/tabaski-guide-complet-senegal.js → /blog/tabaski-guide-complet-senegal
import { renderContentPage, contentResponse } from '../_lib/contentpage.js';

export async function onRequest({ request, env }) {
  const origin = env.SITE_URL || new URL(request.url).origin;
  const faq = {
    '@type': 'FAQPage',
    mainEntity: [
      { '@type': 'Question', name: 'Combien prévoir de budget pour la Tabaski ?', acceptedAnswer: { '@type': 'Answer', text: 'Le poste principal est le mouton, dont le prix varie selon la race, le poids et la période d’achat. À cela s’ajoutent les habits neufs, les ingrédients de la fête et parfois les cadeaux — un budget global anticipé plusieurs semaines à l’avance évite les mauvaises surprises.' } },
      { '@type': 'Question', name: 'Quand commencer à préparer la Tabaski ?', acceptedAnswer: { '@type': 'Answer', text: 'Idéalement un mois avant : le mouton s’achète 2 à 4 semaines avant la fête, les habits et la décoration peuvent être commandés dès que les dates sont connues.' } },
    ],
  };
  const body = `
<h1>Tabaski au Sénégal : bien préparer son budget et son calendrier</h1>
<p class="lead">Au-delà du choix du mouton, la Tabaski implique une organisation d'ensemble : budget, habits neufs, ingrédients de la fête, cadeaux. Voici comment s'y prendre sans stress de dernière minute.</p>

<div class="tldr">
<h2>À retenir</h2>
<ul>
  <li>Établissez votre budget global 3 à 4 semaines avant la fête.</li>
  <li>Le mouton reste le poste le plus important — voir notre guide dédié pour bien le choisir.</li>
  <li>Habits, épices et décoration peuvent être commandés en ligne à l'avance pour éviter la cohue de dernière minute.</li>
</ul>
</div>

<h2>1. Établir un budget réaliste</h2>
<p>Le mouton représente en général le poste le plus lourd du budget Tabaski, suivi par les habits neufs (souvent un boubou ou un ensemble par membre de la famille) et les ingrédients pour les repas de fête. Prévoir une enveloppe globale dès le début du mois permet d'étaler les achats et d'éviter les emprunts de dernière minute.</p>

<h2>2. Un calendrier en 3 étapes</h2>
<ul>
  <li><strong>3-4 semaines avant</strong> : achat du mouton (les prix grimpent fortement dans les derniers jours), commande des habits sur mesure si besoin.</li>
  <li><strong>1-2 semaines avant</strong> : achats de décoration, d'épices et de produits pour les repas de fête, pour éviter la rupture de stock des derniers jours.</li>
  <li><strong>Derniers jours</strong> : finitions (coiffure, dernières courses fraîches) et logistique de transport du mouton si ce n'est pas encore fait.</li>
</ul>

<h2>3. Acheter en ligne pour gagner du temps</h2>
<p>De nombreux achats liés à la Tabaski peuvent se faire à distance : tissus et confection sur la catégorie <a href="${origin}/categorie/mode">Mode & Vêtements</a>, épices et produits du terroir sur <a href="${origin}/categorie/alimentation">Alimentation</a>, et bien sûr le mouton via <a href="${origin}/elevage">NEXUS Élevage</a>, qui géolocalise les éleveurs près de chez vous.</p>

<div class="box">
<p>Pour tout savoir sur le choix et la négociation du mouton lui-même (santé, prix, transport), consultez notre guide détaillé : <a href="${origin}/guide/acheter-mouton-tabaski-senegal">acheter un mouton de Tabaski</a>.</p>
</div>

<h2>4. Anticiper la livraison</h2>
<p>Pour les achats non retirés en main propre, vérifiez les délais de livraison de votre ville — voir <a href="${origin}/guide/comprendre-frais-livraison-dakar">comprendre les frais de livraison à Dakar</a> — et privilégiez une commande anticipée plutôt qu'un achat de dernière minute, période où la demande fait grimper les prix et les délais.</p>

<a class="cta" href="${origin}/elevage">Trouver un éleveur près de chez moi →</a>
<p style="margin-top:1.4rem">Voir aussi : <a href="${origin}/blog">Tous les articles du blog</a> · <a href="${origin}/guides">Tous les guides</a></p>`;

  return contentResponse(renderContentPage({
    origin, path: '/blog/tabaski-guide-complet-senegal',
    title: 'Tabaski au Sénégal : budget, calendrier et préparatifs',
    description: 'Comment bien préparer la Tabaski au Sénégal : budget global, calendrier d\'achat en 3 étapes, et où acheter en ligne mouton, habits et produits de fête.',
    h1: 'Tabaski au Sénégal : bien préparer son budget et son calendrier', crumbName: 'Blog — Tabaski',
    isArticle: true, datePublished: '2026-07-06', bodyHtml: body, extraGraph: [faq],
  }));
}
