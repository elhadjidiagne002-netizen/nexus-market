// functions/annonce/[id].js → /annonce/:id
// Page d'atterrissage SEO d'une annonce express (méta + JSON-LD + Breadcrumb), indexable.
import { renderListingPage, render404, sbGetOne } from '../_lib/seo.js';
import { cachedResponse } from '../_lib/edgecache.js';

export async function onRequest(context) {
  return cachedResponse(context, () => handle(context));
}

async function handle({ request, env, params }) {
  const origin = env.SITE_URL || new URL(request.url).origin;
  const id = params.id;
  const a = await sbGetOne(env, `annonces_express?select=id,category,city,description,photo_url,price_fcfa&id=eq.${encodeURIComponent(id)}&limit=1`);
  if (!a) return render404(origin, "Cette annonce n'est plus disponible.");

  // annonces_express n'a pas de titre dédié → on en compose un à partir des données.
  const rawDesc = String(a.description || '').replace(/\s+/g, ' ').trim();
  const firstSentence = rawDesc.split(/[.\n!?]/)[0].slice(0, 70);
  const title = firstSentence
    ? `${a.category ? a.category + ' — ' : ''}${firstSentence}`
    : `${a.category || 'Annonce'}${a.city ? ' à ' + a.city : ''}`;

  // Meta description : la description vendeur peut être très courte (ex. « fluide »),
  // ce qui donne une meta inutile. Si < 50 caractères, on l'enrichit du contexte
  // (catégorie · ville · prix) pour une meta description exploitable par les moteurs.
  const ctx = [
    a.category,
    a.city ? `à ${a.city}` : '',
    a.price_fcfa ? `${Number(a.price_fcfa).toLocaleString('fr-FR')} FCFA` : '',
  ].filter(Boolean).join(' · ');
  const description = rawDesc.length >= 50
    ? rawDesc
    : `${rawDesc ? rawDesc + ' — ' : ''}${ctx}${ctx ? ' · ' : ''}Annonce à vendre sur NEXUS Market Sénégal`.trim();

  const html = renderListingPage({
    origin, kind: 'annonce', id: a.id, title, description,
    image: a.photo_url, priceFcfa: a.price_fcfa, category: a.category, city: a.city,
  });
  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=600' },
  });
}
