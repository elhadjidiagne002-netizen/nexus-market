// Tests unitaires du client de routage OSRM/VROOM.
// Exécuter : npm run test:unit
// Ne teste que le contrat SANS service configuré (repli Haversine) + la
// conversion de coordonnées : aucun appel réseau, aucun serveur requis.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  haversineKm,
  isPoint,
  routeLeg,
  routeMatrix,
  routingConfigured,
  optimizerConfigured,
  vroomSolve,
  toLonLat,
} from '../../functions/api/_lib/routing.js';

// Dakar (Plateau) → Dakar (Ouakam), ~5,5 km à vol d'oiseau.
const PLATEAU = { lat: 14.6928, lng: -17.4467 };
const OUAKAM = { lat: 14.7167, lng: -17.4876 };

test('haversineKm calcule une distance plausible', () => {
  const km = haversineKm(PLATEAU, OUAKAM);
  assert.ok(km > 4 && km < 7, `attendu ~5,5 km, obtenu ${km}`);
  assert.equal(haversineKm(PLATEAU, PLATEAU), 0);
});

test('isPoint rejette les coordonnées absentes ou hors bornes', () => {
  assert.equal(isPoint(PLATEAU), true);
  assert.equal(isPoint({ lat: 14.7, lng: NaN }), false);
  assert.equal(isPoint({ lat: 91, lng: 0 }), false);
  assert.equal(isPoint({ lat: 0, lng: -181 }), false);
  assert.equal(isPoint(null), false);
  // Position NULL en base : ne doit PAS devenir le point (0, 0).
  assert.equal(isPoint({ lat: null, lng: null }), false);
  assert.equal(isPoint({ lat: '', lng: '' }), false);
});

test('toLonLat inverse bien lat/lng pour OSRM et VROOM', () => {
  assert.deepEqual(toLonLat(PLATEAU), [-17.4467, 14.6928]);
});

test('sans OSRM_BASE_URL, routeLeg replie sur Haversine majoré du détour', async () => {
  const env = {};
  assert.equal(routingConfigured(env), false);
  const leg = await routeLeg(env, PLATEAU, OUAKAM);
  assert.equal(leg.source, 'haversine');
  // Le facteur de détour doit majorer, jamais minorer, la distance à vol d'oiseau.
  assert.ok(leg.distance_km > haversineKm(PLATEAU, OUAKAM));
  assert.ok(leg.duration_min >= 1);
});

test('routeLeg refuse des coordonnées invalides', async () => {
  await assert.rejects(() => routeLeg({}, PLATEAU, { lat: 'x', lng: 0 }));
});

test('routeMatrix replie avec la bonne forme sources × destinations', async () => {
  const m = await routeMatrix({}, [PLATEAU, OUAKAM], [OUAKAM]);
  assert.equal(m.source, 'haversine');
  assert.equal(m.durations_min.length, 2);
  assert.equal(m.durations_min[0].length, 1);
  assert.equal(m.distances_km.length, 2);
});

test('vroomSolve retourne null quand VROOM_BASE_URL est absente', async () => {
  assert.equal(optimizerConfigured({}), false);
  assert.equal(await vroomSolve({}, { vehicles: [], shipments: [] }), null);
});
