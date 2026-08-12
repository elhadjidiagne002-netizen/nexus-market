// tools/scraper/apify-social.mjs
// Prospection FACEBOOK et TIKTOK via des Actors Apify (Apify exécute le scraping côté
// serveur et gère la conformité plateforme ; tu fournis TON token). Extrait le nom, le
// lien, la ville et surtout le TÉLÉPHONE (champ dédié OU trouvé dans la bio/description).
//
// ⚠️ Conformité : n'utilise ces sources que pour de la prospection B2B de pages/profils
// PUBLICS (commerces), et respecte les CGU de chaque plateforme et le RGPD (contact pro).
// Ne cible pas des comptes privés/personnels.
//
// Aucune dépendance : appel HTTP direct à l'API Apify (run-sync-get-dataset-items).
//
// Facebook (Pages publiques — fournis les URLs des pages, une par ligne) :
//   APIFY_TOKEN=xxx node tools/scraper/apify-social.mjs --platform facebook \
//     --urls "https://facebook.com/GarageX; https://facebook.com/GarageY" \
//     --profession "Garage / Mécanicien" --out prospection/fb_garages.csv
//
// TikTok (recherche mot-clé/hashtag ; extrait les créateurs et leur bio) :
//   APIFY_TOKEN=xxx node tools/scraper/apify-social.mjs --platform tiktok \
//     --query "garage dakar; mecanicien senegal" --max 50 \
//     --profession "Garage / Mécanicien" --out prospection/tiktok_garages.csv
//
// Options : --actor <id> (surcharge l'Actor), --input-json '{...}' (input Apify complet),
//           --mobile-only, --source "facebook", --max N.
import { toRow, dedupe, writeCsv, normalizePhone, extractPhone } from './lib/prospects-csv.mjs';

const DEFAULT_ACTOR = {
  facebook: 'apify~facebook-pages-scraper',   // Pages publiques (startUrls)
  tiktok:   'clockworks~tiktok-scraper',       // recherche/hashtag/profils
};

function arg(name, def = null) {
  const i = process.argv.indexOf('--' + name);
  if (i >= 0) return ['mobile-only'].includes(name) ? true : process.argv[i + 1];
  return def;
}
const list = (s) => String(s || '').split(/[;\n]/).map(x => x.trim()).filter(Boolean);

// Récupère une valeur par chemin ("a.b.c") dans un objet.
function getPath(o, path) {
  return path.split('.').reduce((v, k) => (v == null ? v : v[k]), o);
}
function firstOf(o, keys) {
  for (const k of keys) { const v = getPath(o, k); if (v != null && String(v).trim() !== '') return v; }
  return '';
}

// Normalise un item Apify (Facebook page OU TikTok créateur) → champs prospect.
function normalizeItem(it, platform, profession, source) {
  const name = firstOf(it, ['title', 'name', 'pageName', 'fullName',
    'authorMeta.nickName', 'authorMeta.name', 'author.nickname', 'nickName', 'username', 'authorMeta.uniqueId']);
  const bio = firstOf(it, ['bio', 'about', 'intro', 'description', 'pageInfo', 'info',
    'signature', 'authorMeta.signature', 'author.signature', 'text']);
  const phoneField = firstOf(it, ['phone', 'phoneNumber', 'contactPhone', 'mobile', 'whatsapp', 'tel']);
  const address = firstOf(it, ['address', 'addressString', 'location', 'city', 'authorMeta.region']);
  const url = firstOf(it, ['url', 'pageUrl', 'webUrl', 'facebookUrl', 'profileUrl',
    'authorMeta.profileUrl', 'authorMeta.webUrl', 'webVideoUrl']);
  const lat = firstOf(it, ['location.lat', 'lat', 'latitude', 'coordinates.lat']);
  const lng = firstOf(it, ['location.lng', 'lng', 'longitude', 'coordinates.lng']);
  return toRow({
    name, profession, bio,
    phone: normalizePhone(phoneField) || extractPhone(phoneField) || extractPhone(bio),
    address, url, source,
    lat: lat === '' ? null : Number(lat), lng: lng === '' ? null : Number(lng),
  });
}

function buildInput(platform, { queries, urls, max, inputJson }) {
  if (inputJson) { try { return JSON.parse(inputJson); } catch { console.error('❌ --input-json invalide'); process.exit(1); } }
  if (platform === 'facebook') {
    if (!urls.length) { console.error('❌ Facebook : fournis --urls (URLs de pages publiques, une par ligne). La découverte par mot-clé se fait sur facebook.com puis on colle les liens.'); process.exit(1); }
    return { startUrls: urls.map(u => ({ url: u })), resultsLimit: max };
  }
  // tiktok
  if (urls.length) return { profiles: urls, resultsPerPage: max, shouldDownloadVideos: false, shouldDownloadCovers: false, shouldDownloadSubtitles: false };
  if (!queries.length) { console.error('❌ TikTok : fournis --query (mots-clés/hashtags) ou --urls (profils).'); process.exit(1); }
  return { searchQueries: queries, resultsPerPage: max, shouldDownloadVideos: false, shouldDownloadCovers: false, shouldDownloadSubtitles: false };
}

async function run() {
  const token = process.env.APIFY_TOKEN || arg('token');
  if (!token) { console.error('❌ APIFY_TOKEN manquant (apify.com → Settings → API tokens).'); process.exit(1); }
  const platform = String(arg('platform') || '').toLowerCase();
  if (!['facebook', 'tiktok'].includes(platform)) { console.error('❌ --platform facebook|tiktok requis.'); process.exit(1); }
  const actor = arg('actor') || DEFAULT_ACTOR[platform];
  const queries = list(arg('query'));
  const urls = list(arg('urls'));
  const max = parseInt(arg('max', '50'), 10) || 50;
  const out = arg('out') || `prospection/${platform}_senegal.csv`;
  const profession = arg('profession', '');
  const source = arg('source', platform);
  const mobileOnly = arg('mobile-only', false);

  const input = buildInput(platform, { queries, urls, max, inputJson: arg('input-json') });

  console.log(`🔎 Apify ${platform} · Actor ${actor} · ${queries.length ? queries.length + ' requête(s)' : urls.length + ' URL(s)'}…`);
  const url = `https://api.apify.com/v2/acts/${actor}/run-sync-get-dataset-items?token=${encodeURIComponent(token)}`;
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    console.error(`❌ Apify ${res.status} : ${t.slice(0, 400)}`);
    console.error('   Astuce : vérifie que l\'Actor existe (--actor) et que ton crédit Apify suffit.');
    process.exit(1);
  }
  const items = await res.json();
  console.log(`   ${items.length} item(s) bruts reçus.`);

  const rows = items.map(it => normalizeItem(it, platform, profession, source));
  const clean = dedupe(rows, { mobileOnly });
  const stats = writeCsv(clean, out);
  console.log(`✅ Écrit ${stats.count} ligne(s) → ${stats.path}`);
  console.log(`   avec téléphone : ${stats.withPhone} · dont mobiles (7X) : ${stats.mobiles}${mobileOnly ? ' (mobile-only)' : ''}`);
  console.log('   → Importe ce CSV dans nexus_importer.html (onglet ①) ou le panneau admin « Prospects ».');
}

run().catch(e => { console.error('❌', e.message); process.exit(1); });
