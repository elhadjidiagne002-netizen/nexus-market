// tools/scraper/apify-maps.mjs
// Prospection via GOOGLE MAPS en s'appuyant sur l'Actor Apify "Google Maps Scraper"
// (compass/crawler-google-places). Renvoie nom, téléphone, adresse et surtout les
// COORDONNÉES GPS réelles → parfait pour le site (position des pros/vendeurs).
//
// Aucune dépendance : appel HTTP direct à l'API Apify (run-sync-get-dataset-items).
//
// Usage :
//   APIFY_TOKEN=xxxxx node tools/scraper/apify-maps.mjs \
//     --query "carreleur Dakar" \
//     --out prospection/carreleurs_maps_senegal.csv \
//     [--max 60] [--mobile-only] [--source "google-maps"]
//
// Plusieurs requêtes possibles (séparées par ";") :
//   --query "carreleur Dakar; carreleur Thiès; carreleur Mbour"
//
// Coût : offre gratuite Apify ~5 $/mois de crédit (≈ quelques milliers de lieux).
import { toRow, dedupe, writeCsv, isMobile } from './lib/prospects-csv.mjs';

const ACTOR = 'compass~crawler-google-places'; // Actor public "Google Maps Scraper"

function arg(name, def = null) {
  const i = process.argv.indexOf('--' + name);
  if (i >= 0) return (name === 'mobile-only') ? true : process.argv[i + 1];
  return def;
}

async function run() {
  const token = process.env.APIFY_TOKEN || arg('token');
  if (!token) { console.error('❌ APIFY_TOKEN manquant. Crée un compte gratuit sur apify.com → Settings → API tokens.'); process.exit(1); }
  const queries = String(arg('query') || '').split(';').map(s => s.trim()).filter(Boolean);
  if (!queries.length) { console.error('❌ --query requis (ex. "carreleur Dakar; carreleur Thiès")'); process.exit(1); }
  const out = arg('out') || 'prospection/maps_senegal.csv';
  const max = parseInt(arg('max', '50'), 10) || 50;
  const mobileOnly = arg('mobile-only', false);
  const source = arg('source', 'google-maps');

  const input = {
    searchStringsArray: queries,
    maxCrawledPlacesPerSearch: max,
    language: 'fr',
    countryCode: 'sn',          // Sénégal
    skipClosedPlaces: false,
  };

  console.log(`🔎 Apify Google Maps · ${queries.length} requête(s) · max ${max}/requête…`);
  const url = `https://api.apify.com/v2/acts/${ACTOR}/run-sync-get-dataset-items?token=${encodeURIComponent(token)}`;
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    console.error(`❌ Apify ${res.status} : ${t.slice(0, 300)}`);
    process.exit(1);
  }
  const items = await res.json();
  console.log(`   ${items.length} lieu(x) bruts reçus.`);

  const rows = items.map(it => toRow({
    name: it.title || it.name,
    city: it.city,
    address: it.address || [it.street, it.city].filter(Boolean).join(', '),
    phone: it.phone || it.phoneUnformatted,
    lat: it.location?.lat,
    lng: it.location?.lng,
    source,
  }));

  const clean = dedupe(rows, { mobileOnly });
  const stats = writeCsv(clean, out);
  console.log(`✅ Écrit ${stats.count} ligne(s) → ${stats.path}`);
  console.log(`   avec téléphone : ${stats.withPhone} · dont mobiles (7X) : ${stats.mobiles}${mobileOnly ? ' (mobile-only)' : ''}`);
  console.log('   → Importe ce CSV dans nexus_importer.html (onglet ①) ou le panneau admin « Prospects ».');
}

run().catch(e => { console.error('❌', e.message); process.exit(1); });
