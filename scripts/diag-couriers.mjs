// Diagnostic dispatch coursier — interroge la base DÉPLOYÉE via la service key
// (lue depuis .env, jamais affichée). Usage : node scripts/diag-couriers.mjs
import { readFileSync } from 'node:fs';

const env = {};
for (const line of readFileSync(new URL('../.env', import.meta.url), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/);
  if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
}
const URL_ = env.SUPABASE_URL, KEY = env.SUPABASE_SERVICE_KEY;
if (!URL_ || !KEY) { console.error('SUPABASE_URL / SUPABASE_SERVICE_KEY absents du .env'); process.exit(1); }

const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };
const get = async (p) => { const r = await fetch(`${URL_}/rest/v1${p}`, { headers: H }); return { status: r.status, body: await r.json().catch(() => null) }; };
const rpc = async (fn, params = {}) => { const r = await fetch(`${URL_}/rest/v1/rpc/${fn}`, { method: 'POST', headers: H, body: JSON.stringify(params) }); return { status: r.status, body: await r.json().catch(() => null) }; };

const age = (ts) => ts ? Math.round((Date.now() - new Date(ts).getTime()) / 60000) + ' min' : 'JAMAIS';

// 1) État de chaque coursier (couriers + profiles)
const couriers = await get('/couriers?select=user_id,name,is_available,status');
const ids = (couriers.body || []).map(c => `"${c.user_id}"`).join(',');
const profiles = ids ? await get(`/profiles?id=in.(${ids})&select=id,courier_status,current_lat,current_lng,location_updated_at,geolocation`) : { body: [] };
const pmap = Object.fromEntries((profiles.body || []).map(p => [p.id, p]));
console.log('═══ COURSIERS ═══');
for (const c of couriers.body || []) {
  const p = pmap[c.user_id] || {};
  const fresh = p.location_updated_at && (Date.now() - new Date(p.location_updated_at).getTime()) < 15 * 60000;
  const eligible = c.is_available && c.status === 'active' && p.geolocation && fresh;
  console.log(`${eligible ? '🟢 ELIGIBLE ' : '🔴 INVISIBLE'} ${c.name || c.user_id}`
    + ` | approuvé(status)=${c.status} | dispo(is_available)=${c.is_available}`
    + ` | courier_status=${p.courier_status} | geoloc=${p.geolocation ? 'oui' : 'NULL'}`
    + ` | dernier ping=${age(p.location_updated_at)}`);
}

// 2) Compteur public (migration 06-12 appliquée ?)
const cnt = await rpc('online_couriers_count', { p_lat: null, p_lng: null, p_radius_m: 12000 });
console.log('\n═══ RPC online_couriers_count ═══');
console.log(cnt.status === 404 ? '❌ ABSENTE → migration 2026_06_12 PAS exécutée' : `✅ présente → ${JSON.stringify(cnt.body)} livreur(s) éligible(s)`);

// 3) Mode dispatch réellement déployé (cascade vs direct)
const tick = await rpc('dispatch_tick_all', {});
console.log('\n═══ RPC dispatch_tick_all (mode déployé) ═══');
console.log(tick.status >= 400 ? `❌ erreur ${tick.status}: ${JSON.stringify(tick.body)}`
  : `mode=${tick.body?.mode || 'INCONNU (version consolidate/ancienne)'} | advanced=${tick.body?.advanced}`);
console.log(tick.body?.mode === 'cascade_180s' ? '✅ migration cascade 3 min APPLIQUÉE'
  : '❌ migration 2026_06_11_dispatch_cascade_3min PAS appliquée (mode actuel: ' + (tick.body?.mode || 'pré-cascade') + ')');

// 4) Dernières courses + offres
const dl = await get('/deliveries?select=id,status,courier_id,pickup_label,created_at&order=created_at.desc&limit=8');
console.log('\n═══ 8 DERNIÈRES COURSES ═══');
for (const d of dl.body || []) console.log(`${d.created_at?.slice(0, 16)} | ${d.status.padEnd(11)} | coursier=${d.courier_id ? 'assigné' : '—'} | ${d.pickup_label || ''} | ${d.id.slice(0, 8)}`);
const ofs = await get('/delivery_offers?select=delivery_id,courier_id,status,offered_at,expires_at,seq&order=offered_at.desc.nullslast&limit=10');
console.log('\n═══ 10 DERNIÈRES OFFRES ═══');
for (const o of ofs.body || []) console.log(`${o.status.padEnd(8)} | seq=${o.seq} | offerte=${o.offered_at?.slice(11, 16) || '—'} | expire=${o.expires_at?.slice(11, 16) || '—'} | course=${o.delivery_id.slice(0, 8)} | coursier=${o.courier_id?.slice(0, 8)}`);
