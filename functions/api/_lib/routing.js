// functions/api/_lib/routing.js
// Client OSRM (routage/matrice) + VROOM (optimisation de tournées) pour le
// runtime Workers : uniquement fetch(), aucun module Node.
//
// Les deux services sont AUTO-HÉBERGÉS (cf. docs/OSRM_VROOM.md) et OPTIONNELS :
// sans OSRM_BASE_URL, tout retombe sur Haversine × facteur de détour, qui est le
// calcul déjà utilisé partout dans le projet aujourd'hui. Aucun appelant ne doit
// donc casser quand les variables ne sont pas configurées — même contrat que
// shipping-quote.js (repli silencieux) plutôt que 503.
//
// Convention de coordonnées : PARTOUT dans ce fichier, un point est { lat, lng }.
// OSRM/VROOM attendent [lng, lat] — la conversion est faite ici et nulle part
// ailleurs, c'est la source d'erreur n°1 sur ces APIs.

const DEFAULT_TIMEOUT_MS = 8000;
// Rapport distance routière / distance à vol d'oiseau observé en zone urbaine.
// Sert uniquement au repli sans OSRM, pour ne pas sous-estimer le trajet réel.
const DETOUR_FACTOR = 1.35;
// Vitesse moyenne de repli (km/h) — alignée sur liveEta() du frontend.
const FALLBACK_SPEED_KMH = 22;
// OSRM refuse les matrices au-delà de max-table-size (100 par défaut).
const MAX_TABLE_COORDS = 100;

export function routingConfigured(env) {
  return !!env.OSRM_BASE_URL;
}

export function optimizerConfigured(env) {
  return !!env.VROOM_BASE_URL;
}

function base(url) {
  return String(url || '').replace(/\/+$/, '');
}

export function haversineKm(a, b) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

export function isPoint(p) {
  if (!p) return false;
  // Number(null) === 0 et Number('') === 0 : sans ce filtre, un coursier dont la
  // position est NULL en base passerait pour être au large du golfe de Guinée.
  const ok = (v) =>
    v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v));
  return (
    ok(p.lat) &&
    ok(p.lng) &&
    Math.abs(Number(p.lat)) <= 90 &&
    Math.abs(Number(p.lng)) <= 180
  );
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

function fallbackLeg(from, to) {
  const km = round2(haversineKm(from, to) * DETOUR_FACTOR);
  return {
    distance_km: km,
    duration_min: Math.max(1, Math.round((km / FALLBACK_SPEED_KMH) * 60)),
    source: 'haversine',
  };
}

async function osrmFetch(env, path) {
  const timeout = Number(env.OSRM_TIMEOUT_MS) > 0 ? Number(env.OSRM_TIMEOUT_MS) : DEFAULT_TIMEOUT_MS;
  const headers = {};
  if (env.OSRM_API_KEY) headers.Authorization = `Bearer ${env.OSRM_API_KEY}`;
  const r = await fetch(`${base(env.OSRM_BASE_URL)}${path}`, {
    headers,
    signal: AbortSignal.timeout(timeout),
  });
  if (!r.ok) throw new Error(`OSRM ${r.status}`);
  const data = await r.json();
  if (data.code && data.code !== 'Ok') throw new Error(`OSRM ${data.code}`);
  return data;
}

/**
 * Distance et durée routières réelles entre deux points.
 * Retombe sur Haversine × détour si OSRM n'est pas configuré ou échoue.
 * @returns {Promise<{distance_km:number, duration_min:number, source:'osrm'|'haversine'}>}
 */
export async function routeLeg(env, from, to) {
  if (!isPoint(from) || !isPoint(to)) throw new Error('Coordonnées invalides');
  if (!routingConfigured(env)) return fallbackLeg(from, to);
  try {
    const profile = env.OSRM_PROFILE || 'driving';
    const coords = `${from.lng},${from.lat};${to.lng},${to.lat}`;
    const data = await osrmFetch(env, `/route/v1/${profile}/${coords}?overview=false`);
    const route = data.routes?.[0];
    if (!route) return fallbackLeg(from, to);
    return {
      distance_km: round2(route.distance / 1000),
      duration_min: Math.max(1, Math.round(route.duration / 60)),
      source: 'osrm',
    };
  } catch {
    return fallbackLeg(from, to);
  }
}

/**
 * Matrice durée/distance sources × destinations (OSRM /table).
 * Repli : matrice Haversine, même forme de retour.
 * @param {Array<{lat:number,lng:number}>} sources
 * @param {Array<{lat:number,lng:number}>} destinations
 * @returns {Promise<{durations_min:number[][], distances_km:number[][], source:'osrm'|'haversine'}>}
 */
export async function routeMatrix(env, sources, destinations) {
  const fallback = () => ({
    durations_min: sources.map((s) =>
      destinations.map((d) => fallbackLeg(s, d).duration_min)
    ),
    distances_km: sources.map((s) =>
      destinations.map((d) => fallbackLeg(s, d).distance_km)
    ),
    source: 'haversine',
  });

  const total = sources.length + destinations.length;
  if (!routingConfigured(env) || total > MAX_TABLE_COORDS) return fallback();

  try {
    const profile = env.OSRM_PROFILE || 'driving';
    const all = [...sources, ...destinations];
    const coords = all.map((p) => `${p.lng},${p.lat}`).join(';');
    const srcIdx = sources.map((_, i) => i).join(';');
    const dstIdx = destinations.map((_, i) => sources.length + i).join(';');
    const data = await osrmFetch(
      env,
      `/table/v1/${profile}/${coords}?sources=${srcIdx}&destinations=${dstIdx}&annotations=duration,distance`
    );
    if (!data.durations) return fallback();
    return {
      durations_min: data.durations.map((row) =>
        row.map((s) => (s == null ? null : Math.max(1, Math.round(s / 60))))
      ),
      distances_km: (data.distances || []).map((row) =>
        row.map((m) => (m == null ? null : round2(m / 1000)))
      ),
      source: 'osrm',
    };
  } catch {
    return fallback();
  }
}

/**
 * Résout un problème VROOM brut (vehicles / shipments / jobs déjà formatés).
 * Retourne null si VROOM n'est pas configuré ou échoue — l'appelant décide du repli.
 */
export async function vroomSolve(env, problem) {
  if (!optimizerConfigured(env)) return null;
  const timeout = Number(env.VROOM_TIMEOUT_MS) > 0 ? Number(env.VROOM_TIMEOUT_MS) : 20000;
  const headers = { 'Content-Type': 'application/json' };
  if (env.VROOM_API_KEY) headers.Authorization = `Bearer ${env.VROOM_API_KEY}`;
  try {
    const r = await fetch(`${base(env.VROOM_BASE_URL)}/`, {
      method: 'POST',
      headers,
      body: JSON.stringify(problem),
      signal: AbortSignal.timeout(timeout),
    });
    if (!r.ok) return null;
    const data = await r.json();
    // VROOM : code 0 = succès ; 1/2/3 = erreur d'entrée ou de résolution.
    if (data.code !== 0) return null;
    return data;
  } catch {
    return null;
  }
}

/** Convertit un point { lat, lng } en couple [lng, lat] attendu par VROOM/OSRM. */
export function toLonLat(p) {
  return [Number(p.lng), Number(p.lat)];
}
