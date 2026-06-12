// Diagnostic 2 : pourquoi les courses récentes sont no_courier ?
// Distances pickup ↔ coursiers + état des courses en cours des coursiers.
import { readFileSync } from 'node:fs';

const env = {};
for (const line of readFileSync(new URL('../.env', import.meta.url), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/);
  if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
}
const H = { apikey: env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}` };
const get = async (p) => (await fetch(`${env.SUPABASE_URL}/rest/v1${p}`, { headers: H })).json();

const hav = (a, b, c, d) => {
  const R = 6371, r = Math.PI / 180;
  const x = Math.sin((c - a) * r / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin((d - b) * r / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(x));
};

const couriers = await get('/couriers?select=user_id,name,is_available,status');
const profs = await get('/profiles?id=in.(' + couriers.map(c => `"${c.user_id}"`).join(',') + ')&select=id,current_lat,current_lng,location_updated_at');
const pmap = Object.fromEntries(profs.map(p => [p.id, p]));

console.log('═══ POSITIONS COURSIERS ═══');
for (const c of couriers) {
  const p = pmap[c.user_id] || {};
  console.log(`${(c.name || '').padEnd(14)} | lat=${p.current_lat} lng=${p.current_lng} | ping=${p.location_updated_at}`);
}

const dls = await get('/deliveries?select=id,status,courier_id,pickup_lat,pickup_lng,pickup_label,created_at&order=created_at.desc&limit=12');
console.log('\n═══ COURSES RÉCENTES — distance à chaque coursier ═══');
for (const d of dls) {
  const dists = couriers.map(c => {
    const p = pmap[c.user_id] || {};
    if (d.pickup_lat == null || p.current_lat == null) return `${c.name}: ?`;
    return `${c.name}: ${hav(d.pickup_lat, d.pickup_lng, p.current_lat, p.current_lng).toFixed(1)} km`;
  }).join(' | ');
  console.log(`${d.created_at.slice(5, 16)} ${d.status.padEnd(11)} pickup=(${d.pickup_lat?.toFixed(4)},${d.pickup_lng?.toFixed(4)}) → ${dists}`);
}

// Courses encore actives par coursier (explique is_available=false)
const active = await get('/deliveries?select=id,status,courier_id,created_at,assigned_at&status=in.(accepted,picked_up,in_transit)&order=assigned_at.desc&limit=10');
console.log('\n═══ COURSES EN COURS (non livrées) ═══');
if (!active.length) console.log('(aucune)');
for (const d of active) {
  const c = couriers.find(x => x.user_id === d.courier_id);
  console.log(`${d.status.padEnd(10)} | coursier=${c ? c.name : d.courier_id?.slice(0, 8)} | assignée=${d.assigned_at?.slice(5, 16)} | ${d.id.slice(0, 8)}`);
}
