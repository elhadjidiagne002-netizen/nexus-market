// functions/blog/guide-tailles-vetements-senegal.js → /blog/guide-tailles-vetements-senegal
import { renderContentPage, contentResponse } from '../_lib/contentpage.js';

export async function onRequest({ request, env }) {
  const origin = env.SITE_URL || new URL(request.url).origin;
  const faq = {
    '@type': 'FAQPage',
    mainEntity: [
      { '@type': 'Question', name: 'Comment éviter de se tromper de taille en achetant en ligne ?', acceptedAnswer: { '@type': 'Answer', text: 'Comparez toujours vos mesures (tour de poitrine, taille, longueur de pied) au tableau de tailles fourni par le vendeur plutôt qu\'à une lettre (S/M/L) qui varie selon les marques, et contactez le vendeur en cas de doute.' } },
      { '@type': 'Question', name: 'Les tailles sénégalaises correspondent-elles aux tailles européennes ?', acceptedAnswer: { '@type': 'Answer', text: 'Les vêtements traditionnels (boubous, tenues sur mesure) suivent souvent des mensurations prises directement par le couturier plutôt qu\'une taille standard ; les vêtements importés suivent généralement les standards européens ou internationaux.' } },
    ],
  };
  const body = `
<h1>Guide des tailles : vêtements et chaussures au Sénégal</h1>
<p class="lead">Acheter un vêtement ou des chaussures en ligne sans les essayer peut réserver des surprises. Voici comment s'y retrouver entre tailles internationales, tailles locales et vêtements sur mesure.</p>

<div class="tldr">
<h2>À retenir</h2>
<ul>
  <li>Une lettre (S/M/L) ne veut pas dire la même chose selon les marques — préférez les mesures en centimètres quand elles sont disponibles.</li>
  <li>Pour un vêtement traditionnel sur mesure, donnez vos mensurations exactes au couturier plutôt qu'une taille standard.</li>
  <li>En cas de doute, contactez toujours le vendeur avant l'achat : c'est le moyen le plus fiable d'éviter une erreur.</li>
</ul>
</div>

<h2>1. Vêtements : tailles lettres vs mesures</h2>
<table>
<thead><tr><th>Taille lettre</th><th>Tour de poitrine (cm)</th><th>Équivalent FR approximatif</th></tr></thead>
<tbody>
<tr><td>S</td><td>86-91</td><td>36-38</td></tr>
<tr><td>M</td><td>92-97</td><td>40-42</td></tr>
<tr><td>L</td><td>98-105</td><td>44-46</td></tr>
<tr><td>XL</td><td>106-113</td><td>48-50</td></tr>
</tbody>
</table>
<p>Ce tableau reste indicatif : la coupe varie selon les marques et les styles (ajusté, ample). Quand la fiche produit précise des mesures en centimètres, prenez toujours celles-ci comme référence plutôt que la lettre seule.</p>

<h2>2. Chaussures : pointures</h2>
<table>
<thead><tr><th>Pointure EU</th><th>Longueur du pied (cm)</th></tr></thead>
<tbody>
<tr><td>38</td><td>24,0</td></tr>
<tr><td>39</td><td>24,6</td></tr>
<tr><td>40</td><td>25,3</td></tr>
<tr><td>41</td><td>26,0</td></tr>
<tr><td>42</td><td>26,7</td></tr>
<tr><td>43</td><td>27,3</td></tr>
<tr><td>44</td><td>28,0</td></tr>
</tbody>
</table>
<p>Pour vérifier votre pointure, mesurez la longueur de votre pied du talon à l'orteil le plus long, en fin de journée (le pied gonfle légèrement au cours de la journée).</p>

<h2>3. Le cas particulier du sur-mesure</h2>
<p>Pour un boubou, un ensemble traditionnel ou une création d'un couturier local, les tailles standards ne s'appliquent généralement pas : le vendeur prend vos mensurations précises (tour de poitrine, longueur de manche, tour de taille) pour une coupe personnalisée. Précisez toujours ces mesures par message avant de valider la commande.</p>

<div class="box">
<p>Vous vendez des vêtements ou de l'artisanat ? Notre guide <a href="${origin}/guide/vendre-artisanat-mode-senegal">vendre son artisanat et sa mode africaine</a> explique comment bien présenter vos tailles et mesures pour rassurer vos acheteurs.</p>
</div>

<a class="cta" href="${origin}/categorie/mode">Découvrir la catégorie Mode →</a>
<p style="margin-top:1.4rem">Voir aussi : <a href="${origin}/blog">Tous les articles du blog</a> · <a href="${origin}/guides">Tous les guides</a></p>`;

  return contentResponse(renderContentPage({
    origin, path: '/blog/guide-tailles-vetements-senegal',
    title: 'Guide des tailles : vêtements et chaussures au Sénégal',
    description: 'Tableaux de correspondance des tailles de vêtements et pointures de chaussures pour acheter en ligne au Sénégal sans mauvaise surprise.',
    h1: 'Guide des tailles : vêtements et chaussures au Sénégal', crumbName: 'Blog — Guide des tailles',
    isArticle: true, datePublished: '2026-07-06', bodyHtml: body, extraGraph: [faq],
  }));
}
