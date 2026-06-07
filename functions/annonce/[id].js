// functions/annonce/[id].js → /annonce/:id
// Page d'atterrissage SEO d'une annonce express (méta + JSON-LD + Breadcrumb), indexable.
import { renderListingPage, render404, sbGetOne } from '../_lib/seo.js';

export async function onRequest({ request, env, params }) {
  const origin = env.SITE_URL || new URL(request.url).origin;
  const id = params.id;
  const a = await sbGetOne(env, `annonces_express?select=id,category,city,description,photo_url,price_fcfa&id=eq.${encodeURIComponent(id)}&limit=1`);
  if (!a) return render404(origin, "Cette annonce n'est plus disponible.");

  // annonces_express n'a pas de titre dédié → on en compose un à partir des données.
  const firstSentence = String(a.description || '').replace(/\s+/g, ' ').trim().split(/[.\n!?]/)[0].slice(0, 70);
  const title = firstSentence
    ? `${a.category ? a.category + ' — ' : ''}${firstSentence}`
    : `${a.category || 'Annonce'}${a.city ? ' à ' + a.city : ''}`;

  const html = renderListingPage({
    origin, kind: 'annonce', id: a.id, title, description: a.description,
    image: a.photo_url, priceFcfa: a.price_fcfa, category: a.category, city: a.city,
  });
  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=600' },
  });
}
