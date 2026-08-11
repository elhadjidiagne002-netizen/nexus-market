// tools/scraper/lib/prospects-csv.mjs
// Helpers partagés : transforme des résultats bruts (Apify Google Maps, crawler
// annuaire…) en lignes CSV au format attendu par nexus_importer.html (onglet ①) :
//   Nom,Ville,Region,Adresse,Telephone,Source,Latitude,Longitude
// + dédup, normalisation des téléphones sénégalais, priorité aux mobiles (7X).
import fs from 'fs';
import path from 'path';

// Villes → région (sous-ensemble courant ; complète au besoin).
const VILLE_REGION = {
  dakar: 'Dakar', pikine: 'Dakar', guédiawaye: 'Dakar', guediawaye: 'Dakar',
  rufisque: 'Dakar', 'keur massar': 'Dakar', bargny: 'Dakar', diamniadio: 'Dakar',
  thiès: 'Thiès', thies: 'Thiès', mbour: 'Thiès', saly: 'Thiès', tivaouane: 'Thiès',
  'saint-louis': 'Saint-Louis', 'saint louis': 'Saint-Louis',
  kaolack: 'Kaolack', ziguinchor: 'Ziguinchor', touba: 'Diourbel', mbacké: 'Diourbel',
  diourbel: 'Diourbel', louga: 'Louga', tambacounda: 'Tambacounda', kolda: 'Kolda',
  fatick: 'Fatick', matam: 'Matam', kaffrine: 'Kaffrine', kédougou: 'Kédougou', sédhiou: 'Sédhiou',
};

export function regionOf(ville) {
  const v = String(ville || '').trim().toLowerCase();
  if (VILLE_REGION[v]) return VILLE_REGION[v];
  for (const k of Object.keys(VILLE_REGION)) if (v.includes(k)) return VILLE_REGION[k];
  return '';
}

// Normalise un téléphone sénégalais en "+221 XX XXX XX XX". Retourne '' si invalide.
export function normalizePhone(raw) {
  let d = String(raw || '').replace(/\D/g, '');
  if (!d) return '';
  d = d.replace(/^00/, '');
  if (d.length === 9 && /^[73]/.test(d)) d = '221' + d;   // 9 chiffres locaux → +221
  if (!d.startsWith('221')) return '';                    // hors Sénégal → ignore
  const n = d.slice(3);                                    // 9 chiffres nationaux
  if (n.length !== 9) return '';
  return `+221 ${n.slice(0, 2)} ${n.slice(2, 5)} ${n.slice(5, 7)} ${n.slice(7, 9)}`;
}

// true si mobile (préfixe 7X) — pour la priorité "numéros perso".
export function isMobile(phoneFmt) {
  const d = String(phoneFmt || '').replace(/\D/g, '');
  return d.startsWith('221') && d[3] === '7';
}

// Devine la ville depuis une adresse texte (dernier segment connu).
export function cityFromAddress(addr) {
  const s = String(addr || '');
  for (const k of Object.keys(VILLE_REGION)) {
    const re = new RegExp('\\b' + k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i');
    if (re.test(s)) return k.split(' ').map(w => w[0].toUpperCase() + w.slice(1)).join(' ');
  }
  return '';
}

const csvCell = (v) => {
  const s = String(v == null ? '' : v);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};

// Construit une ligne { Nom, Ville, Region, Adresse, Telephone, Source, Latitude, Longitude }.
export function toRow({ name, city, region, address, phone, source, lat, lng }) {
  const tel = normalizePhone(phone);
  const ville = city || cityFromAddress(address);
  return {
    Nom: String(name || '').trim(),
    Ville: ville,
    Region: region || regionOf(ville),
    Adresse: String(address || '').replace(/\s+/g, ' ').trim(),
    Telephone: tel,
    Source: source || '',
    Latitude: (lat != null && isFinite(lat)) ? Number(lat).toFixed(6) : '',
    Longitude: (lng != null && isFinite(lng)) ? Number(lng).toFixed(6) : '',
  };
}

// Dédup par (Nom normalisé + Telephone). Priorité mobile : si options.mobileOnly, ne
// garde que les lignes avec un mobile. Trie mobiles d'abord.
export function dedupe(rows, { mobileOnly = false } = {}) {
  const seen = new Set(); const out = [];
  for (const r of rows) {
    if (!r.Nom) continue;
    if (mobileOnly && !isMobile(r.Telephone)) continue;
    const key = r.Nom.toLowerCase().replace(/\s+/g, ' ') + '|' + r.Telephone;
    if (seen.has(key)) continue;
    seen.add(key); out.push(r);
  }
  out.sort((a, b) => (isMobile(b.Telephone) - isMobile(a.Telephone)));
  return out;
}

const HEADER = ['Nom', 'Ville', 'Region', 'Adresse', 'Telephone', 'Source', 'Latitude', 'Longitude'];

export function writeCsv(rows, outPath) {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  const lines = [HEADER.join(',')];
  for (const r of rows) lines.push(HEADER.map(h => csvCell(r[h])).join(','));
  fs.writeFileSync(outPath, lines.join('\n') + '\n', 'utf8');
  return { path: outPath, count: rows.length, withPhone: rows.filter(r => r.Telephone).length, mobiles: rows.filter(r => isMobile(r.Telephone)).length };
}
