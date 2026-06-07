// functions/vendeur/[id].js → /vendeur/:id
// Vitrine SEO d'un vendeur : produits du vendeur + JSON-LD Store (LocalBusiness)
// pour le référencement local Sénégal + BreadcrumbList + ItemList.
import { renderListPage, render404, sbGetOne, sbGet } from '../_lib/seo.js';

const EUR_TO_FCFA = 655.957;

export async function onRequest({ request, env, params }) {
  const origin = env.SITE_URL || new URL(request.url).origin;
  const id = params.id;

  const v = await sbGetOne(env, `profiles?select=id,name,avatar,bio,rating,shop_category,role&id=eq.${encodeURIComponent(id)}&limit=1`);
  if (!v || (v.role !== 'vendor' && v.role !== 'admin')) return render404(origin, "Ce vendeur n'existe pas.");

  const rows = await sbGet(env, `products?select=id,name,image_url,price&active=eq.true&vendor_id=eq.${encodeURIComponent(id)}&order=created_at.desc&limit=100`);
  const items = (rows || []).map(p => ({
    id: p.id, kind: 'produit', title: p.name, image: p.image_url,
    priceFcfa: p.price ? Math.round(Number(p.price) * EUR_TO_FCFA) : 0,
  }));

  const url = `${origin}/vendeur/${encodeURIComponent(id)}`;
  const shopName = v.name || 'Boutique NEXUS';

  // Store/LocalBusiness — aide le référencement local (« <produit> Dakar »).
  const store = {
    '@type': 'Store',
    name: shopName,
    url,
    image: v.avatar || `${origin}/og-image.png`,
    description: v.bio || `Boutique ${shopName} sur NEXUS Market Sénégal.`,
    address: { '@type': 'PostalAddress', addressCountry: 'SN', addressLocality: 'Dakar' },
    areaServed: 'SN',
    priceRange: 'XOF',
  };
  const rv = Number(v.rating) || 0;
  if (rv > 0) store.aggregateRating = { '@type': 'AggregateRating', ratingValue: rv.toFixed(1), bestRating: 5, ratingCount: Math.max(items.length, 1) };

  const html = renderListPage({
    origin, url, title: `${shopName} — Boutique`,
    description: (v.bio || `Découvrez les ${items.length} produits de ${shopName} sur NEXUS Market Sénégal. Paiement Orange Money, Wave, carte. Livraison partout au Sénégal.`),
    image: v.avatar,
    items,
    breadcrumb: [
      { name: 'Accueil', url: `${origin}/` },
      { name: 'Vendeurs', url: `${origin}/?view=vendors` },
      { name: shopName, url },
    ],
    jsonldExtra: store,
  });

  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=1800' },
  });
}
