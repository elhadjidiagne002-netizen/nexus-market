// Géocode tous les arrêts de bus urbains (AFTU/Dakar Dem Dikk) + les quartiers
// officiels de Dakar via Nominatim (OpenStreetMap, gratuit, sans clé API),
// et écrit un fichier SQL d'import prêt pour `apply_migration` dans
// transport_stops_geo.
//
// Usage : node scripts/geocode-stops.mjs
//
// Aucune clé requise. Respecte la politique d'usage Nominatim (max 1
// requête/seconde, User-Agent identifiable) — ~815 noms ≈ 15 minutes.
// Ne touche pas Supabase en écriture : lit les arrêts en lecture publique
// (anon key, déjà exposée côté client) via PostgREST, écrit uniquement un
// fichier .sql local que l'utilisateur/l'assistant relit avant application.

import { writeFileSync } from 'node:fs';

const SUPABASE_URL = 'https://pqcqbstbdujzaclsiosv.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBxY3Fic3RiZHVqemFjbHNpb3N2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ4MTM0OTIsImV4cCI6MjA5MDM4OTQ5Mn0.NlQewwx2vI-KxS_0VSP-hbtpyt4y-F3eyJ5qUb5S9DE';

const NOMINATIM_USER_AGENT = 'NexusMarket-BusStopGeocoder/1.0 (contact: elhadjidiagne002@gmail.com)';

// 19 communes d'arrondissement de Dakar + communes de la banlieue (Pikine,
// Guédiawaye, Keur Massar, Rufisque) — liste éditoriale, coordonnées
// obtenues via Google ci-dessous (aucune coordonnée supposée ici).
const DAKAR_QUARTIERS = [
  'Plateau', 'Médina', 'Fann-Point E-Amitié', 'Gueule Tapée-Fass-Colobane',
  'Grand Dakar', 'Biscuiterie', 'HLM', 'Hann Bel-Air', 'Sicap-Liberté',
  'Dieuppeul-Derklé', 'Grand Yoff', 'Patte d\'Oie', 'Parcelles Assainies',
  'Cambérène', 'Ngor', 'Ouakam', 'Yoff', 'Mermoz-Sacré Cœur', 'Almadies',
  'Pikine', 'Guédiawaye', 'Golf Sud', 'Sam Notaire', 'Wakhinane Nimzatt',
  'Médina Gounass', 'Keur Massar Nord', 'Keur Massar Sud', 'Yeumbeul Nord',
  'Yeumbeul Sud', 'Malika', 'Jaxaay', 'Rufisque Est', 'Rufisque Ouest',
  'Rufisque Nord', 'Bargny', 'Sébikotane', 'Diamniadio', 'Sangalkam',
  'Tivaouane Peulh-Niaga', 'Bambilor'
];

// Bounding box approximative région de Dakar (peninsule + banlieue +
// Rufisque/Diamniadio) — biaise Nominatim (viewbox) sans exclure les
// résultats hors zone (bounded=0).
const VIEWBOX = 'viewbox=-17.55,14.90,-17.05,14.55&bounded=0';

function sqlEsc(s) { return String(s).replace(/'/g, "''"); }

async function fetchAllStopNames() {
  const url = `${SUPABASE_URL}/rest/v1/transport_lines?select=escales&destinations=ilike.Ligne *&active=eq.true`;
  const res = await fetch(url, { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` } });
  if (!res.ok) throw new Error(`Supabase REST ${res.status}: ${await res.text()}`);
  const rows = await res.json();
  const set = new Set();
  rows.forEach((r) => {
    (r.escales || '').split('|').forEach((s) => {
      s = s.trim();
      if (s) set.add(s);
    });
  });
  return Array.from(set);
}

// Le "viewbox" ci-dessus ne fait que BIASER Nominatim (bounded=0) — des noms de
// rue/lieu génériques (ex. "Embarcadère", "Avenue Léopold Sédar Senghor") ont pu
// matcher le même nom dans une tout autre ville du Sénégal (Saint-Louis, Thiès,
// Ziguinchor…), donnant un point confidemment FAUX plutôt qu'un "introuvable"
// honnête. Un simple filtre lat/lng laisse passer les cas proches de la
// frontière région Dakar/Thiès (ex. Sindia, Diender) — le texte
// "Région de Dakar" dans l'adresse formatée par Nominatim est un signal
// beaucoup plus précis, utilisé ici comme filtre principal.
function inDakarRegion(formatted) {
  return /r[ée]gion de dakar/i.test(formatted || '');
}

async function geocodeOne(name) {
  const q = encodeURIComponent(`${name}, Sénégal`);
  const url = `https://nominatim.openstreetmap.org/search?q=${q}&format=jsonv2&limit=1&countrycodes=sn&${VIEWBOX}`;
  const res = await fetch(url, { headers: { 'User-Agent': NOMINATIM_USER_AGENT, Referer: 'https://nexusmarket.sn' } });
  if (!res.ok) return { status: 'error', lat: null, lng: null, formatted: `HTTP ${res.status}` };
  const body = await res.json().catch(() => null);
  if (Array.isArray(body) && body[0]) {
    if (!inDakarRegion(body[0].display_name)) return { status: 'not_found', lat: null, lng: null, formatted: null };
    return {
      status: 'ok',
      lat: parseFloat(body[0].lat),
      lng: parseFloat(body[0].lon),
      formatted: body[0].display_name || null,
    };
  }
  return { status: 'not_found', lat: null, lng: null, formatted: null };
}

async function main() {
  console.log('Récupération des arrêts depuis Supabase…');
  const rawStops = await fetchAllStopNames();
  const allNames = Array.from(new Set([...DAKAR_QUARTIERS, ...rawStops])).sort((a, b) => a.localeCompare(b, 'fr'));
  console.log(`${allNames.length} noms uniques à géocoder (${DAKAR_QUARTIERS.length} quartiers + ${rawStops.length} arrêts bruts).`);

  const rows = [];
  let ok = 0, notFound = 0, err = 0;
  for (let i = 0; i < allNames.length; i++) {
    const name = allNames[i];
    let result;
    try {
      result = await geocodeOne(name);
    } catch (e) {
      result = { status: 'error', lat: null, lng: null, formatted: String(e) };
    }
    if (result.status === 'ok') ok++;
    else if (result.status === 'not_found') notFound++;
    else err++;
    rows.push({ name, ...result });
    if ((i + 1) % 25 === 0 || i === allNames.length - 1) {
      console.log(`  ${i + 1}/${allNames.length} — ok:${ok} introuvable:${notFound} erreur:${err}`);
    }
    // Politique d'usage Nominatim : max 1 requête/seconde.
    await new Promise((r) => setTimeout(r, 1100));
  }

  const values = rows.map((r) => {
    const lat = r.lat == null ? 'null' : r.lat;
    const lng = r.lng == null ? 'null' : r.lng;
    const formatted = r.formatted ? `'${sqlEsc(r.formatted)}'` : 'null';
    return `('${sqlEsc(r.name)}', ${lat}, ${lng}, ${formatted}, '${r.status}', now())`;
  });

  const sql = `-- Généré par scripts/geocode-stops.mjs — ${new Date().toISOString()}
-- ${allNames.length} noms (arrêts bus urbains AFTU/DDD + quartiers officiels Dakar), source Nominatim/OpenStreetMap.
insert into public.transport_stops_geo (stop_name, lat, lng, formatted_address, geocode_status, geocoded_at)
values
${values.join(',\n')}
on conflict (stop_name) do update set
  lat = excluded.lat,
  lng = excluded.lng,
  formatted_address = excluded.formatted_address,
  geocode_status = excluded.geocode_status,
  geocoded_at = excluded.geocoded_at;
`;

  const outPath = new URL('../sql/2026_08_31_transport_stops_geo_import.sql', import.meta.url);
  writeFileSync(outPath, sql, 'utf8');
  console.log(`\nTerminé. Écrit : ${outPath.pathname.replace(/^\/([A-Za-z]:)/, '$1')}`);
  console.log(`Résumé : ${ok} géocodés, ${notFound} introuvables, ${err} erreurs.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
