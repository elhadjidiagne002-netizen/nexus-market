// functions/_lib/categories.js
// Référentiel canonique des catégories NEXUS Market (slug ↔ libellé(s) DB ↔ catégorie Google).
// Sert aux pages d'atterrissage /categorie/:slug, au fil d'Ariane (BreadcrumbList)
// et aux flux Google Merchant. Les libellés `aliases` couvrent les variantes réelles
// stockées en base (champ TEXT libre, plusieurs orthographes historiques).

// [FIX UNIFORMISATION 2026-07-05] Le formulaire produit principal (public/index.html,
// « Extraire depuis une URL ») propose 66 catégories détaillées (ex. "Téléphones &
// Accessoires", "Meubles & Décoration"…). Avant ce fix, seules 2 des 66 avaient un
// alias ici → pour tous les autres produits, slugForLabel() retombait sur un slug
// générique (slugify du libellé complet) qui ne correspond à AUCUNE page
// /categorie/:slug réelle : le fil d'Ariane (BreadcrumbList, SEO) pointait vers une
// page inexistante pour la quasi-totalité du catalogue. Le filtrage catalogue
// principal (React, `products.category` en exact match) n'est PAS affecté — ce
// fix ne touche que la couverture SEO/breadcrumb. Certains rattachements sont des
// approximations raisonnables faute de bucket dédié (immobilier, livres, voyages,
// dons/troc → pas de slug propre parmi les 11 piliers actuels) : à ajuster si de
// nouvelles pages de catégorie dédiées sont créées plus tard.
export const CATEGORIES = [
  { slug: 'electronique', label: 'Électronique',     aliases: ['Électronique', 'Electronique', 'Électronique & Hi-Fi', 'Appareils photo & Vidéo', 'Jeux vidéo & Consoles', 'Montres connectées', 'Éclairage'], google: 'Electronics' },
  { slug: 'informatique', label: 'Informatique',     aliases: ['Informatique', 'Ordinateurs & Tablettes', 'Informatique & Tech (services)'], google: 'Electronics > Computers' },
  { slug: 'telephones',   label: 'Téléphones',        aliases: ['Téléphones', 'Telephones', 'Téléphonie', 'Téléphones & Accessoires'],            google: 'Electronics > Communications > Telephony' },
  { slug: 'mode',         label: 'Mode & Vêtements',  aliases: ['Mode & Vêtements', 'Mode', 'Vêtements', 'Vetements', 'Mode Femme', 'Mode Homme', 'Mode Enfant', 'Chaussures', 'Sacs & Maroquinerie', 'Bijoux & Accessoires', 'Tissus & Wax', 'Textile & Couture (pro)'], google: 'Apparel & Accessories' },
  { slug: 'alimentation', label: 'Alimentation',      aliases: ['Alimentation', 'Alimentation générale', 'Produits bio & locaux', 'Boissons', 'Épices & Condiments', 'Céréales & Légumineuses', 'Produits laitiers', 'Boulangerie & Pâtisserie', 'Produits locaux'], google: 'Food, Beverages & Tobacco' },
  { slug: 'maison',       label: 'Maison & Déco',     aliases: ['Maison & Déco', 'Maison', 'Maison & Deco', 'Déco', 'Meubles & Décoration', 'Électroménager', 'Cuisine & Art de la table', 'Linge de maison', 'Jardinage & Extérieur', 'Bricolage & Outillage'],  google: 'Home & Garden' },
  { slug: 'beaute',       label: 'Beauté & Santé',    aliases: ['Beauté & Santé', 'Beauté', 'Beaute & Sante', 'Santé', 'Beauté & Cosmétiques', 'Parfums', 'Santé & Bien-être'], google: 'Health & Beauty' },
  { slug: 'sport',        label: 'Sport & Loisirs',   aliases: ['Sport & Loisirs', 'Sport', 'Loisirs', 'Sport & Fitness', 'Jouets & Jeux', 'Musique & Instruments', 'Livres & Presses', 'Livres papier', 'eBooks & PDF', 'Livres audio', 'BD & Mangas', 'Manuels scolaires', 'Presse & Magazines', 'Livres anciens & Rares', 'Voyages & Tourisme', 'Arts & Artisanat', 'Collections & Antiquités'], google: 'Sporting Goods' },
  { slug: 'services',     label: 'Services',          aliases: ['Services', 'Services à domicile', 'Formation & Cours', 'Événementiel', 'Transport & Logistique', 'Location appartement', 'Vente immobilier', 'Terrains & Parcelles', 'Bureaux & Locaux commerciaux', 'BTP & Construction', 'Matériel professionnel', 'Fournitures de bureau', 'Dons & Trocs', 'Autre'], google: 'Shopping' },
  { slug: 'auto',         label: 'Auto & Moto',       aliases: ['Auto & Moto', 'Auto', 'Moto', 'Véhicules', 'Voitures', 'Motos & Scooters', 'Vélos & Trottinettes', 'Pièces & Accessoires auto'],          google: 'Vehicles & Parts' },
  { slug: 'animaux',      label: 'Animaux & Élevage', aliases: ['Animaux & Élevage', 'Animaux', 'Élevage', 'Elevage', 'Bétail', 'Agriculture & Élevage', 'Animaux de compagnie', 'Accessoires animaux', 'Alimentation animaux'], google: 'Animals & Pet Supplies' },
];

// slug générique (minuscules, sans accent, tirets) — pour libellés hors référentiel.
export function slugify(s) {
  return String(s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')   // retire les accents
    .toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

// Retrouve l'entrée catégorie depuis un slug d'URL.
export function categoryBySlug(slug) {
  const s = slugify(slug);
  return CATEGORIES.find(c => c.slug === s) || null;
}

// Donne le slug canonique d'un libellé DB (sinon slug générique).
export function slugForLabel(label) {
  const l = String(label || '').trim().toLowerCase();
  const hit = CATEGORIES.find(c => c.aliases.some(a => a.toLowerCase() === l));
  return hit ? hit.slug : slugify(label);
}

// Catégorie Google Merchant pour un libellé DB.
export function googleCategory(label) {
  const l = String(label || '').trim().toLowerCase();
  const hit = CATEGORIES.find(c => c.aliases.some(a => a.toLowerCase() === l));
  return hit ? hit.google : 'Shopping';
}
