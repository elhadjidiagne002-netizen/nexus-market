// tools/scraper/crawlee-directory.mjs
// Prospection depuis un ANNUAIRE public (statique) avec Crawlee (CheerioCrawler,
// léger — pas de navigateur). Piloté par un fichier de config JSON (sélecteurs CSS)
// pour s'adapter à n'importe quel annuaire. Produit un CSV au format importateur.
//
// ⚠️ Best-effort : certains annuaires masquent les téléphones (JS/anti-bot) ou
// renvoient 500 aux robots. Pour Google Maps, utilise plutôt apify-maps.mjs (fiable).
//
// Usage :
//   node tools/scraper/crawlee-directory.mjs --config configs/mon-annuaire.json --out prospection/xxx.csv
//
// Format du config (voir configs/example-directory.json) :
//   { "start": "https://…", "source": "mon-annuaire", "maxPages": 20,
//     "item": ".listing",            // sélecteur d'une fiche
//     "name": ".title", "phone": ".tel", "address": ".addr", "city": ".city",
//     "next": "a.next",              // lien page suivante (optionnel)
//     "mobileOnly": false }
import fs from 'fs';
import { CheerioCrawler } from 'crawlee';
import { toRow, dedupe, writeCsv } from './lib/prospects-csv.mjs';

function arg(name, def = null) { const i = process.argv.indexOf('--' + name); return i >= 0 ? process.argv[i + 1] : def; }

const cfgPath = arg('config');
if (!cfgPath) { console.error('❌ --config requis (chemin d\'un JSON de sélecteurs).'); process.exit(1); }
const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
const out = arg('out') || 'prospection/annuaire_senegal.csv';

const rows = [];
let pages = 0;

const crawler = new CheerioCrawler({
  maxRequestsPerCrawl: (cfg.maxPages || 20) + 2,
  maxConcurrency: 2,                 // poli : 2 requêtes en parallèle max
  requestHandlerTimeoutSecs: 60,
  async requestHandler({ $, request, enqueueLinks, log }) {
    pages++;
    let n = 0;
    $(cfg.item).each((_, el) => {
      const pick = (sel) => sel ? $(el).find(sel).first().text().replace(/\s+/g, ' ').trim() : '';
      const name = pick(cfg.name);
      if (!name) return;
      rows.push(toRow({
        name,
        city: pick(cfg.city),
        address: pick(cfg.address),
        phone: pick(cfg.phone) || $(el).find('a[href^="tel:"]').first().attr('href')?.replace('tel:', '') || '',
        source: cfg.source || new URL(request.url).hostname,
      }));
      n++;
    });
    log.info(`Page ${pages} (${request.url}) → ${n} fiche(s)`);
    if (cfg.next && pages < (cfg.maxPages || 20)) {
      await enqueueLinks({ selector: cfg.next });
    }
  },
  failedRequestHandler({ request, log }) { log.warning(`Échec : ${request.url}`); },
});

console.log(`🔎 Crawlee · ${cfg.source || cfg.start} …`);
await crawler.run([cfg.start]);

const clean = dedupe(rows, { mobileOnly: !!cfg.mobileOnly });
const stats = writeCsv(clean, out);
console.log(`✅ Écrit ${stats.count} ligne(s) → ${stats.path} (avec tél : ${stats.withPhone}, mobiles : ${stats.mobiles})`);
console.log('   → Importe ce CSV dans nexus_importer.html (onglet ①) ou le panneau admin « Prospects ».');
