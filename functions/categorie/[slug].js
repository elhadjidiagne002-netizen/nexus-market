// functions/categorie/[slug].js → /categorie/:slug
// Page d'atterrissage SEO d'une catégorie : liste les produits actifs de la
// catégorie avec JSON-LD ItemList + BreadcrumbList. URLs propres (slug sans accent).
import { renderListPage, render404, sbGet } from '../_lib/seo.js';
import { categoryBySlug } from '../_lib/categories.js';
import { cachedResponse } from '../_lib/edgecache.js';

const EUR_TO_FCFA = 655.957;

export async function onRequest(context) {
  return cachedResponse(context, () => handle(context));
}

async function handle({ request, env, params }) {
  const origin = env.SITE_URL || new URL(request.url).origin;
  const cat = categoryBySlug(params.slug);
  if (!cat) return render404(origin, "Cette catégorie n'existe pas.");

  // Couvre toutes les variantes d'orthographe stockées en base via OR.
  const ors = cat.aliases.map(a => `category.eq.${encodeURIComponent(a)}`).join(',');
  const rows = await sbGet(env, `products?select=id,name,image_url,price&active=eq.true&or=(${ors})&order=created_at.desc&limit=100`);

  const items = (rows || []).map(p => ({
    id: p.id, kind: 'produit', title: p.name, image: p.image_url,
    priceFcfa: p.price ? Math.round(Number(p.price) * EUR_TO_FCFA) : 0,
  }));

  const url = `${origin}/categorie/${cat.slug}`;
  const html = renderListPage({
    origin, url, title: `${cat.label} au Sénégal`,
    description: `Achetez ${cat.label.toLowerCase()} au Sénégal sur NEXUS Market : ${items.length} produits disponibles, paiement Orange Money, Wave ou carte bancaire, livraison partout. Protection acheteur garantie.`,
    image: items[0] && items[0].image,
    items,
    breadcrumb: [
      { name: 'Accueil', url: `${origin}/` },
      { name: cat.label, url },
    ],
  });

  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=1800' },
  });
}
