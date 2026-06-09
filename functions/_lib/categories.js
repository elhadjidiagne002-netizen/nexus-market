// functions/_lib/categories.js
// Référentiel canonique des catégories NEXUS Market (slug ↔ libellé(s) DB ↔ catégorie Google).
// Sert aux pages d'atterrissage /categorie/:slug, au fil d'Ariane (BreadcrumbList)
// et aux flux Google Merchant. Les libellés `aliases` couvrent les variantes réelles
// stockées en base (champ TEXT libre, plusieurs orthographes historiques).

export const CATEGORIES = [
  { slug: 'electronique', label: 'Électronique',     aliases: ['Électronique', 'Electronique'],                      google: 'Electronics' },
  { slug: 'informatique', label: 'Informatique',     aliases: ['Informatique'],                                      google: 'Electronics > Computers' },
  { slug: 'telephones',   label: 'Téléphones',        aliases: ['Téléphones', 'Telephones', 'Téléphonie'],            google: 'Electronics > Communications > Telephony' },
  { slug: 'mode',         label: 'Mode & Vêtements',  aliases: ['Mode & Vêtements', 'Mode', 'Vêtements', 'Vetements'], google: 'Apparel & Accessories' },
  { slug: 'alimentation', label: 'Alimentation',      aliases: ['Alimentation'],                                      google: 'Food, Beverages & Tobacco' },
  { slug: 'maison',       label: 'Maison & Déco',     aliases: ['Maison & Déco', 'Maison', 'Maison & Deco', 'Déco'],  google: 'Home & Garden' },
  { slug: 'beaute',       label: 'Beauté & Santé',    aliases: ['Beauté & Santé', 'Beauté', 'Beaute & Sante', 'Santé'], google: 'Health & Beauty' },
  { slug: 'sport',        label: 'Sport & Loisirs',   aliases: ['Sport & Loisirs', 'Sport', 'Loisirs'],               google: 'Sporting Goods' },
  { slug: 'services',     label: 'Services',          aliases: ['Services'],                                          google: 'Shopping' },
  { slug: 'auto',         label: 'Auto & Moto',       aliases: ['Auto & Moto', 'Auto', 'Moto', 'Véhicules'],          google: 'Vehicles & Parts' },
  { slug: 'animaux',      label: 'Animaux & Élevage', aliases: ['Animaux & Élevage', 'Animaux', 'Élevage', 'Elevage', 'Bétail', 'Agriculture & Élevage', 'Animaux de compagnie'], google: 'Animals & Pet Supplies' },
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
