// functions/_lib/pro-hubs.js
// Pages d'annuaire « métier × ville » pour NEXUS Pro (/pro/macon-dakar) et
// règle de « substance » d'une fiche pro individuelle.
//
// [POURQUOI — Search Console, 2026-09-05] L'export « Détectée, actuellement non
// indexée » listait 1352 pages, dont ~600 fiches /pro/<uuid>, TOUTES avec
// « dernière exploration = 1970-01-01 » (= jamais explorées). Cause mesurée en
// base sur 2695 pros actifs : 0 photo, 0 avis, 3 tarifs, 9 expériences, et
// 192 descriptions d'une longueur MOYENNE de 5 caractères. Une fiche ne portait
// donc qu'un nom + un métier + une ville, pour seulement 48 métiers et 88
// villes → des centaines de pages quasi identiques. Google a refusé d'y
// dépenser du budget d'exploration, ce qui pénalisait aussi les 721 fiches
// produit, elles réellement remplies (721 descriptions, 554 images).
//
// Stratégie : ne déclarer à l'index QUE des pages à contenu réel —
//   • les hubs métier × ville, qui agrègent (107 combos ≥ 3 pros couvrent
//     2420 des 2695 pros) et correspondent à la vraie demande de recherche
//     (« plombier Dakar », et non le nom d'un artisan inconnu) ;
//   • les fiches individuelles qui ont de la substance (cf. proHasSubstance).
// Les autres fiches restent accessibles aux visiteurs, mais en noindex et hors
// sitemap : on ne cache rien, on cesse juste de réclamer leur indexation.

import { slugify } from './categories.js';

// Seuil d'ouverture d'un hub. En dessous, la page n'agrégerait presque rien et
// retomberait dans le travers qu'on corrige (page maigre de plus).
export const PRO_MIN_PER_HUB = 3;

export function proHubSlug(profession, city) {
  const p = slugify(profession), c = slugify(city);
  return (p && c) ? `${p}-${c}` : '';
}

// Une fiche mérite sa propre page indexable si elle apporte un contenu que le
// hub ne porte pas déjà. Seuil de description à 60 caractères : au-dessous, on
// est sur du bruit (la moyenne actuelle est de 5 caractères).
export function proHasSubstance(p) {
  if (!p) return false;
  const desc = String(p.description || '').trim();
  return desc.length >= 60
    || !!String(p.photo_url || '').trim()
    || Number(p.rating_count) > 0
    || (Number(p.experience_years) > 0 && !!String(p.tarif_text || '').trim());
}

// Villes fictives présentes en base : ne doivent jamais devenir une page
// (« Maçon à Non précisé » n'a aucun sens et serait exactement la page maigre
// qu'on cherche à supprimer).
const CITY_PLACEHOLDERS = new Set(['non precise', 'non precisee', 'inconnu', 'n a', 'na', '-']);

function isRealCity(city) {
  const s = slugify(city).replace(/-/g, ' ');
  return !!s && !CITY_PLACEHOLDERS.has(s);
}

// Construit la table des hubs à partir de lignes {profession, city}.
// Renvoie une Map slug -> { slug, profession, city, count, professions[], cities[] }.
//
// ⚠ La base contient des VARIANTES d'orthographe qui se réduisent au même slug :
// « Thiès »/« Thies », « Guédiawaye »/« Guediawaye », « Garage / Mécanicien »/
// « Garage / Mecanicien », « Carrosserie / Tôlerie auto »/« … Tolerie … ».
// C'est une bonne chose (une seule page par métier×ville réelle), mais il faut
// conserver TOUTES les variantes : la page interroge ensuite `profession=in.(…)`
// et `city=in.(…)`, sinon elle annoncerait 8 artisans et n'en afficherait que 6.
export function buildProHubs(rows, minPerHub = PRO_MIN_PER_HUB) {
  const acc = new Map();
  for (const r of (rows || [])) {
    const profession = (r && r.profession || '').trim();
    const city = (r && r.city || '').trim();
    if (!profession || !city || !isRealCity(city)) continue;
    const slug = proHubSlug(profession, city);
    if (!slug) continue;
    let cur = acc.get(slug);
    if (!cur) {
      cur = { slug, profession, city, count: 0, professions: new Set(), cities: new Set() };
      acc.set(slug, cur);
    }
    cur.count++;
    cur.professions.add(profession);
    cur.cities.add(city);
  }
  for (const [slug, h] of acc) {
    if (h.count < minPerHub) { acc.delete(slug); continue; }
    // Libellé affiché = la variante la plus fréquente n'est pas calculée ici ;
    // on garde la première vue, mais les listes servent aux requêtes.
    h.professions = [...h.professions];
    h.cities = [...h.cities];
  }
  return acc;
}

// Valeur pour un filtre PostgREST `col=in.(…)` : chaque valeur entre guillemets
// doubles (les libellés contiennent virgules, parenthèses et apostrophes).
export function pgIn(values) {
  return '(' + (values || []).map(v => `"${String(v).replace(/"/g, '\\"')}"`).join(',') + ')';
}
