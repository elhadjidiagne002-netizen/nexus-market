// functions/troc.js → /troc
// Page d'atterrissage SEO de NEXUS Troc : liste les échanges actifs (ItemList +
// Breadcrumb). Capte le trafic « troc Dakar », « échange téléphone Sénégal », etc.
import { renderListPage, sbGet } from './_lib/seo.js';
import { cachedResponse } from './_lib/edgecache.js';

export async function onRequest(context) {
  return cachedResponse(context, () => handle(context));
}

async function handle({ request, env }) {
  const origin = env.SITE_URL || new URL(request.url).origin;
  const url = `${origin}/troc`;

  const rows = await sbGet(env, `troc_listings?select=id,title,photo_url,want,city&status=eq.active&order=created_at.desc&limit=100`);
  const items = (rows || []).map(t => ({
    id: t.id, kind: 'troc',
    title: `${t.title || 'Objet'}${t.want ? ' ⇄ ' + String(t.want).slice(0, 40) : ''}`,
    image: t.photo_url,
  }));

  const html = renderListPage({
    origin, url, title: 'NEXUS Troc — Échangez sans argent au Sénégal',
    description: `Troquez vos objets sans argent sur NEXUS Troc : ${items.length} échanges en cours. « Mon téléphone contre ta tablette » — la culture du troc, en ligne et en sécurité. Dakar, Thiès, Saint-Louis et tout le Sénégal.`,
    image: items[0] && items[0].image,
    items,
    breadcrumb: [
      { name: 'Accueil', url: `${origin}/` },
      { name: 'NEXUS Troc', url },
    ],
  });
  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=900' },
  });
}
