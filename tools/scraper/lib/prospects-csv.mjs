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

// Extrait le 1er téléphone sénégalais valide d'un texte libre (bio Facebook/TikTok,
// description…). Renvoie le format normalisé, ou '' si aucun.
export function extractPhone(text) {
  const s = String(text || '');
  const cands = s.match(/\+?\d[\d\s.\-]{7,}\d/g) || [];
  for (const c of cands) { const p = normalizePhone(c); if (p) return p; }
  return '';
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

// ── Registre global (anti-doublon inter-prospections) ────────────────────────
// Clés de comparaison : 9 derniers chiffres du téléphone, et nom normalisé.
export function phone9(raw) { const d = String(raw || '').replace(/\D/g, ''); return d.length >= 9 ? d.slice(-9) : ''; }
export function nameNorm(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim(); }

// Parse un CSV (gère les guillemets). Retourne { header:[], rows:[{col:val}] }.
export function parseCsv(text) {
  const out = []; let i = 0, field = '', row = [], inQ = false; const s = String(text || '');
  while (i < s.length) {
    const c = s[i];
    if (inQ) { if (c === '"') { if (s[i + 1] === '"') { field += '"'; i += 2; continue; } inQ = false; i++; continue; } field += c; i++; continue; }
    if (c === '"') { inQ = true; i++; continue; }
    if (c === ',') { row.push(field); field = ''; i++; continue; }
    if (c === '\r') { i++; continue; }
    if (c === '\n') { row.push(field); out.push(row); row = []; field = ''; i++; continue; }
    field += c; i++;
  }
  if (field.length || row.length) { row.push(field); out.push(row); }
  const header = (out.shift() || []).map((h) => h.trim());
  const rows = out.filter((r) => r.some((x) => x !== '')).map((r) => { const o = {}; header.forEach((h, j) => { o[h] = r[j] !== undefined ? r[j] : ''; }); return o; });
  return { header, rows };
}

// Charge le registry.csv (colonnes phone9,name_norm) → { phones:Set, names:Set }.
export function loadRegistry(csvPath) {
  const { header, rows } = parseCsv(fs.readFileSync(csvPath, 'utf8'));
  const pk = header.find((h) => /^phone9$/i.test(h)) || 'phone9';
  const nk = header.find((h) => /^name_norm$/i.test(h)) || 'name_norm';
  const phones = new Set(), names = new Set();
  for (const r of rows) { const p = String(r[pk] || '').trim(); const n = String(r[nk] || '').trim(); if (p) phones.add(p); if (n) names.add(n); }
  return { phones, names };
}

// Filtre les lignes déjà connues du registre. mode: 'phone' | 'name' | 'both'.
// nameCol/phoneCol : noms de colonnes du CSV d'entrée (défaut Nom / Telephone).
export function filterKnown(rows, reg, { mode = 'both', nameCol = 'Nom', phoneCol = 'Telephone' } = {}) {
  const kept = [], dropped = [];
  for (const r of rows) {
    const p = phone9(r[phoneCol]); const n = nameNorm(r[nameCol]);
    const knownP = p && reg.phones.has(p);
    const knownN = n && reg.names.has(n);
    const isKnown = mode === 'phone' ? knownP : mode === 'name' ? knownN : (knownP || knownN);
    (isKnown ? dropped : kept).push(r);
  }
  return { kept, dropped };
}

// Écrit des lignes génériques en CSV en préservant l'ordre des colonnes `header`.
export function writeCsvGeneric(header, rows, outPath) {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  const lines = [header.map(csvCell).join(',')];
  for (const r of rows) lines.push(header.map((h) => csvCell(r[h])).join(','));
  fs.writeFileSync(outPath, lines.join('\n') + '\n', 'utf8');
  return { path: outPath, count: rows.length };
}

// Construit une ligne prospect. `phone` peut être déjà normalisé ou brut ; si vide et
// `bio` fourni (réseaux sociaux), on tente d'extraire un numéro du texte. `profession`
// et `url` (lien de la page/profil) sont optionnels — lus par nexus_importer.html.
export function toRow({ name, city, region, address, phone, source, lat, lng, profession, url, bio }) {
  const tel = normalizePhone(phone) || extractPhone(phone) || extractPhone(bio);
  const ville = city || cityFromAddress(address) || cityFromAddress(bio);
  return {
    Nom: String(name || '').trim(),
    Profession: String(profession || '').trim(),
    Telephone: tel,
    Ville: ville,
    Region: region || regionOf(ville),
    Adresse: String(address || '').replace(/\s+/g, ' ').trim(),
    Latitude: (lat != null && isFinite(lat)) ? Number(lat).toFixed(6) : '',
    Longitude: (lng != null && isFinite(lng)) ? Number(lng).toFixed(6) : '',
    Source: source || '',
    Url: String(url || '').trim(),
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

const HEADER = ['Nom', 'Profession', 'Telephone', 'Ville', 'Region', 'Adresse', 'Latitude', 'Longitude', 'Source', 'Url'];

export function writeCsv(rows, outPath) {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  const lines = [HEADER.join(',')];
  for (const r of rows) lines.push(HEADER.map(h => csvCell(r[h])).join(','));
  fs.writeFileSync(outPath, lines.join('\n') + '\n', 'utf8');
  return { path: outPath, count: rows.length, withPhone: rows.filter(r => r.Telephone).length, mobiles: rows.filter(r => isMobile(r.Telephone)).length };
}
