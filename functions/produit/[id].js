// functions/produit/[id].js → /produit/:id
// Page d'atterrissage SEO d'un produit (méta + JSON-LD Product + Breadcrumb +
// AggregateRating), indexable par Google.
import { renderListingPage, render404, sbGetOne } from '../_lib/seo.js';
import { cachedResponse } from '../_lib/edgecache.js';

export async function onRequest(context) {
  return cachedResponse(context, () => handle(context));
}

async function handle({ request, env, params }) {
  const origin = env.SITE_URL || new URL(request.url).origin;
  const id = params.id;
  const p = await sbGetOne(env, `products?select=id,name,description,image_url,price,category,stock,rating,reviews_count,vendor_name,rental_specs,animal_specs&id=eq.${encodeURIComponent(id)}&active=eq.true&limit=1`);
  // Produit inexistant/retiré → 404 (noindex) plutôt qu'une redirection 302 :
  // signal de désindexation propre pour les moteurs.
  if (!p) return render404(origin, "Ce produit n'est plus disponible.");

  // [VITRINE] Fiches annuaire importées (loueurs, éleveurs — sql/2026_08_12_loueurs_vitrine.sql)
  // avec un prix placeholder (1 EUR) non représentatif d'un vrai tarif. Le frontend
  // React (isVitrineListing()) affiche déjà "Sur devis" au lieu du prix pour ces
  // fiches — on applique la même règle ici pour ne pas injecter de faux prix dans
  // le JSON-LD Offer/Google (ex. "656 FCFA" pour la location d'un véhicule).
  const isVitrine = !!((p.rental_specs && p.rental_specs.is_vitrine === true)
    || (p.animal_specs && p.animal_specs.is_vitrine === true));

  // [PRIX] products.price est stocké en EUR (le frontend l'affiche via ×EUR_TO_FCFA).
  const EUR_TO_FCFA = 655.957;
  const priceFcfa = (p.price && !isVitrine) ? Math.round(Number(p.price) * EUR_TO_FCFA) : 0;
  // [CONTENU] Les 65 fiches vitrine importées ont toutes la même description
  // gabarit stockée en base ("Location — <Catégorie>. Contact : <X>. Tarif sur
  // devis.") — risque de contenu quasi-dupliqué à l'échelle (seuil Quality Gate
  // dépassé, cf. audit SEO). On reconstruit ici une description par fiche à
  // partir des champs réels de rental_specs (ville, catégorie, source du
  // contact) plutôt que de ré-émettre le gabarit stocké tel quel : chaque page
  // reste distincte (nom + ville + catégorie + canal de contact varient).
  const specs = p.rental_specs || p.animal_specs || {};
  // Ne pas reprendre specs.contact_phone tel quel : renderListingPage() applique
  // redactContact() (RT-01) à toute description, qui remplacerait un numéro par
  // "[contact via NEXUS]" — trompeur ici (ce n'est PAS un contact via l'app, ces
  // fiches vitrine sont un annuaire public sans intermédiation). contact_source
  // (nom de domaine) n'est jamais un motif redacté, donc reste lisible.
  const description = isVitrine
    ? [
        `${p.name} propose la location de ${(specs.category || p.category || 'matériel').toLowerCase()}`
          + (specs.ville ? ` à ${specs.ville}` : specs.region ? ` en région ${specs.region}` : '') + '.',
        specs.contact_source ? `Coordonnées : ${specs.contact_source}.` : '',
        'Tarif sur devis, à confirmer directement avec le prestataire — référencé par NEXUS Market.',
      ].filter(Boolean).join(' ')
    : p.description;
  // [ADSENSE/SEO] Fiche de DÉMO (seed a0000001-… ou image placeholder) → noindex :
  // on n'indexe pas de contenu factice (« faible valeur » AdSense/Google).
  const isDemo = /^a0000001-/.test(String(p.id)) || /picsum\.photos|placehold\.co/i.test(p.image_url || '');
  // [PHOTO GÉNÉRIQUE] Les fiches Immobilier + Location vitrine (sql/2026_08_26_
  // fix_immobilier_location_photos.sql) portent une photo générique par type de
  // bien, jamais la vraie photo de l'annonce (aucune de ces fiches n'en a
  // jamais eu). Détecté par le chemin de stockage dédié — averti visiblement
  // pour ne pas laisser croire à un visiteur que c'est le bien réel.
  const isGenericPhoto = /\/generic-immobilier-location\//.test(p.image_url || '');
  // [RENFORCEMENT JURIDIQUE 2026-08-26] Avertissement visible pour l'Immobilier —
  // cf. CGU article 19 : NEXUS n'est ni agent immobilier ni partie à la
  // transaction, ne vérifie pas les biens annoncés. Catégorie la plus exposée
  // (fraude, vice caché, titre foncier) parmi les verticales de la plateforme.
  const safetyNotice = p.category === 'Immobilier'
    ? "NEXUS Market ne vérifie pas ce bien (titre, disponibilité, exactitude des informations) et n'est pas partie à la transaction. Vérifiez toujours directement avec l'agence ou le propriétaire avant tout versement."
    : null;
  const html = renderListingPage({
    origin, kind: 'produit', id: p.id, title: p.name, description,
    image: p.image_url, priceFcfa, category: p.category,
    rating: p.rating, reviewsCount: p.reviews_count,
    inStock: (p.stock || 0) > 0, vendorName: p.vendor_name, noindex: isDemo,
    genericPhoto: isGenericPhoto, safetyNotice,
  });
  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=600' },
  });
}
