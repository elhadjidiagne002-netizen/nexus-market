// functions/api/courier/optimize.js → POST /api/courier/optimize
//
// Attribution coursier calculée sur des TRAJETS ROUTIERS RÉELS (OSRM), et non
// plus à vol d'oiseau. Deux modes :
//
//   1) Classement — { delivery_id, radius_m?, limit? }
//      Le pré-filtre PostGIS (nearby_couriers, grand-cercle) reste la première
//      passe : c'est lui qui borne la liste. OSRM ne fait que RE-CLASSER cette
//      liste courte par temps de route réel jusqu'au point de retrait. Un
//      coursier à 800 m à vol d'oiseau mais de l'autre côté de la corniche perd
//      donc sa fausse première place.
//      → { mode:'rank', couriers:[{courier_id, user_id, name, eta_pickup_min, …}], leg }
//
//   2) Tournée groupée — { delivery_ids:[…], radius_m?, max_per_courier? }
//      VROOM résout l'affectation multi-courses / multi-coursiers (chaque course
//      = un « shipment » retrait→dépôt, chaque coursier = un véhicule).
//      → { mode:'batch', routes:[{courier_id, steps, duration_min, distance_km}], unassigned }
//
// Ne MODIFIE rien en base : cet endpoint ne fait que CALCULER. L'attribution
// effective reste la cascade d'offres SQL (_activate_next_offer) ou
// admin_assign_delivery. C'est volontaire — brancher l'optimiseur directement
// sur l'écriture ferait diverger deux sources de vérité de dispatch.
//
// Auth : admin (JWT Supabase) OU appel interne (X-Internal-Secret).
// Dégradation : sans OSRM_BASE_URL le mode 1 répond quand même (Haversine ×
// détour, `routing:'haversine'`) ; sans VROOM_BASE_URL le mode 2 répond 503.
// Déploiement des services : docs/OSRM_VROOM.md
import { options, json, err, requireAdmin, isInternalCall, supabase } from '../_lib/utils.js';
import { rateLimit, clientIp, tooManyRequests } from '../_lib/ratelimit.js';
import {
  routeLeg,
  routeMatrix,
  vroomSolve,
  optimizerConfigured,
  isPoint,
  toLonLat,
} from '../_lib/routing.js';

const DEFAULT_RADIUS_M = 30000; // aligné sur la cascade SQL (rayon 30 km)
const DEFAULT_LIMIT = 20;
const MAX_BATCH = 25;

const inList = (ids) => `in.(${ids.map((i) => `"${i}"`).join(',')})`;

async function loadDeliveries(sb, ids) {
  const rows = await sb
    .from('deliveries')
    .select(
      'id,status,pickup_lat,pickup_lng,pickup_label,dropoff_lat,dropoff_lng,dropoff_label,courier_payout',
      `id=${inList(ids)}`
    );
  return Array.isArray(rows) ? rows : [];
}

/** Coursiers disponibles autour d'un point, avec leur position live. */
async function candidatesAround(sb, { lat, lng }, radiusM, limit) {
  const near = await sb.rpc('nearby_couriers', {
    p_lat: lat,
    p_lng: lng,
    p_radius_m: radiusM,
    p_limit: limit,
  });
  const list = Array.isArray(near) ? near : [];
  if (!list.length) return [];

  // nearby_couriers ne renvoie pas les coordonnées — on les relit sur profiles
  // (source de vérité de la position live, alimentée par courier_ping).
  const userIds = list.map((c) => c.user_id).filter(Boolean);
  if (!userIds.length) return [];
  const profiles = await sb
    .from('profiles')
    .select('id,current_lat,current_lng,location_updated_at', `id=${inList(userIds)}`);
  const pos = new Map((Array.isArray(profiles) ? profiles : []).map((p) => [p.id, p]));

  return list
    .map((c) => {
      const p = pos.get(c.user_id);
      return {
        courier_id: c.courier_id,
        user_id: c.user_id,
        name: c.name,
        phone: c.phone,
        vehicle_type: c.vehicle_type,
        rating_avg: c.rating_avg,
        crow_km: c.distance_km,
        location_updated_at: p?.location_updated_at ?? null,
        point: p ? { lat: Number(p.current_lat), lng: Number(p.current_lng) } : null,
      };
    })
    .filter((c) => isPoint(c.point));
}

// ── Mode 1 : classement par temps de route réel ──────────────────────────────
async function rankForDelivery(env, sb, deliveryId, radiusM, limit) {
  const [d] = await loadDeliveries(sb, [deliveryId]);
  if (!d) return err('Course introuvable', 404);
  const pickup = { lat: Number(d.pickup_lat), lng: Number(d.pickup_lng) };
  if (!isPoint(pickup)) return err('Course sans coordonnées de retrait', 422);

  const candidates = await candidatesAround(sb, pickup, radiusM, limit);
  if (!candidates.length) {
    return json({ mode: 'rank', delivery_id: deliveryId, couriers: [], routing: 'none' });
  }

  const matrix = await routeMatrix(
    env,
    candidates.map((c) => c.point),
    [pickup]
  );

  const dropoff = { lat: Number(d.dropoff_lat), lng: Number(d.dropoff_lng) };
  const leg = isPoint(dropoff) ? await routeLeg(env, pickup, dropoff) : null;

  const couriers = candidates
    .map((c, i) => ({
      courier_id: c.courier_id,
      user_id: c.user_id,
      name: c.name,
      phone: c.phone,
      vehicle_type: c.vehicle_type,
      rating_avg: c.rating_avg,
      crow_km: c.crow_km,
      road_km: matrix.distances_km?.[i]?.[0] ?? null,
      eta_pickup_min: matrix.durations_min?.[i]?.[0] ?? null,
      location_updated_at: c.location_updated_at,
    }))
    // Un coursier injoignable par la route (null) part en fin de liste plutôt
    // que d'être écarté : la cascade SQL doit pouvoir lui proposer la course.
    .sort((a, b) => (a.eta_pickup_min ?? 1e9) - (b.eta_pickup_min ?? 1e9));

  return json({
    mode: 'rank',
    delivery_id: deliveryId,
    pickup_label: d.pickup_label,
    dropoff_label: d.dropoff_label,
    leg,
    couriers,
    routing: matrix.source,
  });
}

// ── Mode 2 : affectation groupée (VROOM) ─────────────────────────────────────
async function optimizeBatch(env, sb, ids, radiusM, limit, maxPerCourier) {
  const deliveries = (await loadDeliveries(sb, ids)).filter((d) =>
    isPoint({ lat: Number(d.pickup_lat), lng: Number(d.pickup_lng) }) &&
    isPoint({ lat: Number(d.dropoff_lat), lng: Number(d.dropoff_lng) })
  );
  if (!deliveries.length) return err('Aucune course avec des coordonnées exploitables', 422);

  // Centroïde des retraits : point de recherche des coursiers pour le lot.
  const centroid = {
    lat: deliveries.reduce((s, d) => s + Number(d.pickup_lat), 0) / deliveries.length,
    lng: deliveries.reduce((s, d) => s + Number(d.pickup_lng), 0) / deliveries.length,
  };
  const candidates = await candidatesAround(sb, centroid, radiusM, limit);
  if (!candidates.length) return json({ mode: 'batch', routes: [], unassigned: ids, reason: 'no_courier' });

  // VROOM n'accepte que des identifiants NUMÉRIQUES : on indexe et on remappe
  // vers les uuid dans la réponse.
  const problem = {
    vehicles: candidates.map((c, i) => ({
      id: i,
      start: toLonLat(c.point),
      capacity: [maxPerCourier],
    })),
    shipments: deliveries.map((d, i) => ({
      amount: [1],
      pickup: { id: i, location: toLonLat({ lat: d.pickup_lat, lng: d.pickup_lng }) },
      delivery: { id: i, location: toLonLat({ lat: d.dropoff_lat, lng: d.dropoff_lng }) },
    })),
  };

  const sol = await vroomSolve(env, problem);
  if (!sol) return err('Optimiseur indisponible', 502);

  const routes = (sol.routes || []).map((r) => {
    const c = candidates[r.vehicle];
    return {
      courier_id: c?.courier_id ?? null,
      user_id: c?.user_id ?? null,
      name: c?.name ?? null,
      duration_min: Math.round((r.duration || 0) / 60),
      distance_km: r.distance != null ? Math.round(r.distance / 100) / 10 : null,
      steps: (r.steps || [])
        .filter((s) => s.type === 'pickup' || s.type === 'delivery')
        .map((s) => ({
          type: s.type,
          delivery_id: deliveries[s.id]?.id ?? null,
          label:
            s.type === 'pickup'
              ? deliveries[s.id]?.pickup_label ?? null
              : deliveries[s.id]?.dropoff_label ?? null,
          arrival_min: Math.round((s.arrival || 0) / 60),
        })),
    };
  });

  return json({
    mode: 'batch',
    routes,
    unassigned: (sol.unassigned || []).map((u) => deliveries[u.id]?.id ?? null).filter(Boolean),
    summary: {
      assigned: sol.summary?.routes ?? routes.length,
      duration_min: Math.round((sol.summary?.duration || 0) / 60),
    },
  });
}

export async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') return options();
  if (request.method !== 'POST') return err('POST requis', 405);

  if (!isInternalCall(request, env)) {
    const rl = await rateLimit(env, `courier-optimize:${clientIp(request)}`, 20, 60);
    if (!rl.allowed) return tooManyRequests(rl.resetAt);
    const [, adminErr] = await requireAdmin(request, env);
    if (adminErr) return adminErr;
  }

  let body;
  try { body = await request.json(); } catch { return err('JSON invalide', 400); }

  const radiusM = Number(body.radius_m) > 0 ? Math.min(Number(body.radius_m), 100000) : DEFAULT_RADIUS_M;
  const limit = Number(body.limit) > 0 ? Math.min(Number(body.limit), 50) : DEFAULT_LIMIT;

  try {
    const sb = supabase(env);

    if (Array.isArray(body.delivery_ids) && body.delivery_ids.length) {
      if (!optimizerConfigured(env)) {
        return err('Optimisation groupée non configurée (VROOM_BASE_URL manquante).', 503);
      }
      const ids = body.delivery_ids.slice(0, MAX_BATCH);
      const maxPerCourier =
        Number(body.max_per_courier) > 0 ? Math.min(Number(body.max_per_courier), 10) : 3;
      return await optimizeBatch(env, sb, ids, radiusM, limit, maxPerCourier);
    }

    if (body.delivery_id) {
      return await rankForDelivery(env, sb, body.delivery_id, radiusM, limit);
    }

    return err('delivery_id ou delivery_ids requis', 400);
  } catch (e) {
    return err(e.message || 'Erreur optimisation', 500);
  }
}
