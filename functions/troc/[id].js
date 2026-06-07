// functions/troc/[id].js → /troc/:id
// Page d'atterrissage SEO d'une annonce de troc (échange sans argent), indexable.
import { renderListingPage, render404, sbGetOne } from '../_lib/seo.js';
import { cachedResponse } from '../_lib/edgecache.js';

export async function onRequest(context) {
  return cachedResponse(context, () => handle(context));
}

async function handle({ request, env, params }) {
  const origin = env.SITE_URL || new URL(request.url).origin;
  const id = params.id;
  const t = await sbGetOne(env, `troc_listings?select=id,title,description,photo_url,category,city,want,est_value_fcfa,status&id=eq.${encodeURIComponent(id)}&limit=1`);
  if (!t || t.status !== 'active') return render404(origin, "Cette annonce de troc n'est plus disponible.");

  const title = `${t.title || 'Objet à troquer'} — Troc`;
  const wantTxt = t.want ? ` Recherche en échange : ${t.want}.` : '';
  const description = `${t.description || t.title || ''}.${wantTxt} Échange sans argent sur NEXUS Troc${t.city ? ' à ' + t.city : ' au Sénégal'}.`;

  const html = renderListingPage({
    origin, kind: 'troc', id: t.id, title, description,
    image: t.photo_url, category: t.category || 'Troc', city: t.city,
    // pas de prix : c'est un échange. est_value_fcfa reste indicatif, non affiché comme offre.
  });
  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=600' },
  });
}
