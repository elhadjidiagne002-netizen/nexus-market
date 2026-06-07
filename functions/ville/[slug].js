// functions/ville/[slug].js → /ville/:slug
// Page d'atterrissage SEO locale : annonces express d'une ville du Sénégal.
// Capte les recherches géolocalisées (« acheter à Thiès », « annonces Saint-Louis »).
import { renderListPage, render404, sbGet } from '../_lib/seo.js';
import { slugify } from '../_lib/categories.js';

// Principales villes du Sénégal (slug → libellé + variantes DB).
const VILLES = [
  { slug: 'dakar',       label: 'Dakar',       aliases: ['Dakar'] },
  { slug: 'thies',       label: 'Thiès',       aliases: ['Thiès', 'Thies'] },
  { slug: 'saint-louis', label: 'Saint-Louis', aliases: ['Saint-Louis', 'Saint Louis'] },
  { slug: 'touba',       label: 'Touba',       aliases: ['Touba'] },
  { slug: 'rufisque',    label: 'Rufisque',    aliases: ['Rufisque'] },
  { slug: 'kaolack',     label: 'Kaolack',     aliases: ['Kaolack'] },
  { slug: 'mbour',       label: 'Mbour',       aliases: ['Mbour'] },
  { slug: 'ziguinchor',  label: 'Ziguinchor',  aliases: ['Ziguinchor'] },
  { slug: 'diourbel',    label: 'Diourbel',    aliases: ['Diourbel'] },
  { slug: 'louga',       label: 'Louga',       aliases: ['Louga'] },
  { slug: 'tambacounda', label: 'Tambacounda', aliases: ['Tambacounda'] },
  { slug: 'kolda',       label: 'Kolda',       aliases: ['Kolda'] },
];

export async function onRequest({ request, env, params }) {
  const origin = env.SITE_URL || new URL(request.url).origin;
  const s = slugify(params.slug);
  const ville = VILLES.find(v => v.slug === s);
  if (!ville) return render404(origin, "Cette ville n'est pas couverte.");

  const ors = ville.aliases.map(a => `city.eq.${encodeURIComponent(a)}`).join(',');
  const rows = await sbGet(env, `annonces_express?select=id,category,description,photo_url,price_fcfa&status=eq.active&or=(${ors})&order=created_at.desc&limit=100`);

  const items = (rows || []).map(a => {
    const t = String(a.description || '').replace(/\s+/g, ' ').trim().split(/[.\n!?]/)[0].slice(0, 60);
    return {
      id: a.id, kind: 'annonce',
      title: t || `${a.category || 'Annonce'} à ${ville.label}`,
      image: a.photo_url, priceFcfa: a.price_fcfa,
    };
  });

  const url = `${origin}/ville/${ville.slug}`;
  const html = renderListPage({
    origin, url, title: `Annonces à ${ville.label}`,
    description: `Petites annonces et bons plans à ${ville.label} (Sénégal) sur NEXUS Market : ${items.length} annonces en ligne. Achetez et vendez près de chez vous, paiement Orange Money & Wave, livraison locale.`,
    image: items[0] && items[0].image,
    items,
    breadcrumb: [
      { name: 'Accueil', url: `${origin}/` },
      { name: `Annonces ${ville.label}`, url },
    ],
  });

  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=1800' },
  });
}
