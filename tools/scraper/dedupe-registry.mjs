// tools/scraper/dedupe-registry.mjs
// Filtre un CSV de prospection contre le REGISTRE GLOBAL (registry.csv) pour retirer
// les entités DÉJÀ dans Supabase (comptes, prospects, produits, transport, annonces)
// → évite les doublons lors des futures prospections.
//
// 1) Dans Supabase → SQL Editor, lance sql/2026_08_12_export_registry.sql (crée la vue),
//    puis exécute la requête finale (select phone9,name_norm …) et « Download CSV »
//    vers tools/scraper/registry.csv.
// 2) Filtre ton nouveau CSV :
//    node tools/scraper/dedupe-registry.mjs --registry registry.csv \
//         --in ../../prospection/nouveaux.csv --out ../../prospection/nouveaux_clean.csv
//    Options : --by phone|name|both (défaut both), --name-col Nom, --phone-col Telephone.
import fs from 'fs';
import { parseCsv, loadRegistry, filterKnown, writeCsvGeneric } from './lib/prospects-csv.mjs';

function arg(name, def = null) { const i = process.argv.indexOf('--' + name); return i >= 0 ? process.argv[i + 1] : def; }

const regPath = arg('registry', 'registry.csv');
const inPath = arg('in');
const outPath = arg('out');
const mode = arg('by', 'both');
const nameCol = arg('name-col', 'Nom');
const phoneCol = arg('phone-col', 'Telephone');

if (!inPath || !outPath) { console.error('❌ --in et --out requis. Voir l\'en-tête du fichier pour l\'usage.'); process.exit(1); }
if (!fs.existsSync(regPath)) { console.error(`❌ Registre introuvable : ${regPath}. Exporte-le depuis Supabase (voir sql/2026_08_12_export_registry.sql).`); process.exit(1); }

const reg = loadRegistry(regPath);
console.log(`📇 Registre : ${reg.phones.size} téléphones · ${reg.names.size} noms connus.`);

const { header, rows } = parseCsv(fs.readFileSync(inPath, 'utf8'));
if (!header.includes(nameCol) && !header.includes(phoneCol)) {
  console.error(`❌ Le CSV d'entrée n'a ni « ${nameCol} » ni « ${phoneCol} ». Colonnes : ${header.join(', ')}`);
  process.exit(1);
}
const { kept, dropped } = filterKnown(rows, reg, { mode, nameCol, phoneCol });
const stats = writeCsvGeneric(header, kept, outPath);
console.log(`✅ ${stats.count} nouvelle(s) ligne(s) → ${stats.path}`);
console.log(`   ${dropped.length} déjà connue(s) (retirées) · mode « ${mode} ».`);
if (dropped.length) console.log('   Ex. retirés : ' + dropped.slice(0, 5).map((r) => r[nameCol] || r[phoneCol]).join(' · '));
