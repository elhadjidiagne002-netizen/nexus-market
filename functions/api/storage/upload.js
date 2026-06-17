// functions/api/storage/upload.js → POST /api/storage/upload?name=<nom>
// Téléverse un fichier (PDF / eBook / audio) DIRECTEMENT dans Cloudflare R2
// (binding env.PDF_BUCKET) — n'utilise PAS le stockage Supabase. Renvoie une URL
// /api/files/<clé> servie par functions/api/files/[[path]].js.
//
// Prérequis Cloudflare : Pages → Settings → Functions → R2 bindings →
//   Variable name = PDF_BUCKET, bucket = (ton bucket R2). Aucune clé secrète.
//
// Auth : vendeur connecté (Bearer Supabase). Taille max 50 Mo.
import { requireAuth, json, err, options } from '../_lib/utils.js';

const MAX_BYTES = 50 * 1024 * 1024;
const ALLOWED_CT = /^(application\/pdf|application\/epub\+zip|application\/octet-stream|audio\/(mpeg|mp4|x-m4a)|application\/zip)$/i;

export async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') return options();
  if (request.method !== 'POST') return err('POST requis', 405);

  const bucket = env.PDF_BUCKET;
  if (!bucket) return err('Stockage R2 non configuré (binding PDF_BUCKET manquant côté Cloudflare).', 503);

  const [user, authErr] = await requireAuth(request, env);
  if (authErr) return authErr;

  const ct = (request.headers.get('Content-Type') || 'application/octet-stream').split(';')[0].trim();
  if (!ALLOWED_CT.test(ct)) return err('Type de fichier non autorisé (PDF, ePub, audio).', 415);

  const len = Number(request.headers.get('Content-Length') || '0');
  if (len && len > MAX_BYTES) return err('Fichier trop lourd (max 50 Mo).', 413);

  // Nom sûr + clé namespacée par vendeur.
  let raw = 'fichier';
  try { raw = decodeURIComponent(new URL(request.url).searchParams.get('name') || 'fichier'); } catch (_) {}
  const safe = raw.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/_+/g, '_').slice(-80) || 'fichier';
  const key = `${user.id}/${Date.now()}-${Math.random().toString(16).slice(2, 8)}-${safe}`;

  let body;
  try {
    body = await request.arrayBuffer();
  } catch (e) { return err('Lecture du fichier impossible : ' + (e.message || e), 400); }
  if (!body || body.byteLength === 0) return err('Fichier vide.', 400);
  if (body.byteLength > MAX_BYTES) return err('Fichier trop lourd (max 50 Mo).', 413);

  try {
    await bucket.put(key, body, { httpMetadata: { contentType: ct } });
  } catch (e) { return err('Écriture R2 impossible : ' + (e.message || e), 502); }

  return json({ ok: true, url: '/api/files/' + key, key });
}
