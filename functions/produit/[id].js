// functions/produit/[id].js → /produit/:id
// Page d'atterrissage SEO d'un produit (méta + JSON-LD Product + Breadcrumb +
// AggregateRating), indexable par Google.
import { renderListingPage, render404, sbGetOne } from '../_lib/seo.js';

export async function onRequest({ request, env, params }) {
  const origin = env.SITE_URL || new URL(request.url).origin;
  const id = params.id;
  const p = await sbGetOne(env, `products?select=id,name,description,image_url,price,category,stock,rating,reviews_count,vendor_name&id=eq.${encodeURIComponent(id)}&active=eq.true&limit=1`);
  // Produit inexistant/retiré → 404 (noindex) plutôt qu'une redirection 302 :
  // signal de désindexation propre pour les moteurs.
  if (!p) return render404(origin, "Ce produit n'est plus disponible.");

  // [PRIX] products.price est stocké en EUR (le frontend l'affiche via ×EUR_TO_FCFA).
  const EUR_TO_FCFA = 655.957;
  const priceFcfa = p.price ? Math.round(Number(p.price) * EUR_TO_FCFA) : 0;
  const html = renderListingPage({
    origin, kind: 'produit', id: p.id, title: p.name, description: p.description,
    image: p.image_url, priceFcfa, category: p.category,
    rating: p.rating, reviewsCount: p.reviews_count,
    inStock: (p.stock || 0) > 0, vendorName: p.vendor_name,
  });
  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=600' },
  });
}
