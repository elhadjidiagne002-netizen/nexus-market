// functions/blog/bien-nourrir-loger-animaux-elevage-quotidien.js
import { renderContentPage, contentResponse } from '../_lib/contentpage.js';

export async function onRequest({ request, env }) {
  const origin = env.SITE_URL || new URL(request.url).origin;
  const faq = {
    '@type': 'FAQPage',
    mainEntity: [
      { '@type': 'Question', name: 'Combien de temps garder un mouton avant de le consommer ?', acceptedAnswer: { '@type': 'Answer', text: 'Cela dépend de la date d\'achat par rapport à la fête ; quelques jours à quelques semaines suffisent avec un abri ombragé, de l\'eau propre et du fourrage adapté.' } },
      { '@type': 'Question', name: 'Faut-il un espace particulier pour garder des animaux en ville ?', acceptedAnswer: { '@type': 'Answer', text: 'Un coin ombragé, aéré et facile à nettoyer suffit pour une garde de courte durée ; renseignez-vous sur les règles de votre quartier pour un élevage plus long ou en plus grand nombre.' } },
    ],
  };
  const body = `
<h1>Bien nourrir et loger ses animaux d'élevage au quotidien</h1>
<p class="lead">Que vous gardiez un mouton avant la Tabaski ou que vous éleviez de la volaille au quotidien, quelques principes de base garantissent la bonne santé de vos animaux.</p>

<div class="tldr">
<h2>À retenir</h2>
<ul>
  <li>Un abri ombragé et aéré protège les animaux de la chaleur, surtout en saison sèche.</li>
  <li>L'eau propre doit être disponible en permanence, changée régulièrement.</li>
  <li>Une alimentation adaptée à l'espèce évite les carences et les problèmes de santé.</li>
</ul>
</div>

<h2>1. Un abri simple mais efficace</h2>
<p>Un espace ombragé, aéré et facile à nettoyer suffit pour la plupart des animaux domestiques ou de garde temporaire. L'important est de protéger l'animal du soleil direct aux heures les plus chaudes et de lui laisser suffisamment d'espace pour bouger.</p>

<h2>2. L'eau, un besoin constant</h2>
<p>L'eau propre doit être disponible en permanence et changée régulièrement, surtout en saison chaude où les besoins augmentent nettement. Un manque d'eau reste l'une des causes les plus fréquentes de problèmes de santé chez le bétail.</p>

<h2>3. Une alimentation adaptée</h2>
<ul>
  <li><strong>Moutons et bétail</strong> : fourrage, foin et compléments selon la disponibilité locale.</li>
  <li><strong>Volaille</strong> : céréales et compléments protéinés adaptés à l'âge des animaux.</li>
  <li><strong>Animaux de compagnie</strong> : alimentation spécifique disponible dans la <a href="${origin}/categorie/animaux">catégorie Animaux & Élevage</a>.</li>
</ul>

<h2>4. Surveiller les signes de bonne santé</h2>
<p>Un animal en bonne santé reste vif, mange normalement et a les yeux clairs. Tout changement de comportement (apathie, perte d'appétit) doit alerter et mériter une attention rapide, voire l'avis d'un vétérinaire si les moyens le permettent.</p>

<h2>5. Pour l'achat d'un mouton de Tabaski</h2>
<p>Si vous achetez votre mouton plusieurs semaines à l'avance, ces principes de base (ombre, eau, fourrage) suffisent largement pour la période de garde — voir notre guide complet <a href="${origin}/guide/acheter-mouton-tabaski-senegal">acheter un mouton de Tabaski</a> pour tout savoir sur le choix et la négociation.</p>

<a class="cta" href="${origin}/elevage">Découvrir NEXUS Élevage →</a>
<p style="margin-top:1.4rem">Voir aussi : <a href="${origin}/blog">Tous les articles du blog</a> · <a href="${origin}/guides">Tous les guides</a></p>`;

  return contentResponse(renderContentPage({
    origin, path: '/blog/bien-nourrir-loger-animaux-elevage-quotidien',
    title: 'Bien nourrir et loger ses animaux d\'élevage au quotidien',
    description: 'Les bases pour bien nourrir et loger ses animaux au quotidien au Sénégal : abri, eau, alimentation adaptée et signes de bonne santé.',
    h1: 'Bien nourrir et loger ses animaux d\'élevage au quotidien', crumbName: 'Blog — Soin des animaux',
    isArticle: true, datePublished: '2026-07-06', bodyHtml: body, extraGraph: [faq],
  }));
}
