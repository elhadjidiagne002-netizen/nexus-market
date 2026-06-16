// functions/api/stories/upload.js → POST /api/stories/upload
// [NEXUS STORIES] Deux modes de publication :
//
//   A. DIRECT (par défaut, SANS Mux) — le client a déjà téléversé la vidéo dans
//      Supabase Storage (bucket public `nexus-stories`) et envoie son URL
//      publique dans `videoUrl`. On insère la story en status='active' tout de
//      suite. Aucune dépendance Mux → marche toujours.
//
//   B. MUX (optionnel, si MUX_TOKEN_ID/SECRET configurés et `videoUrl` absent) —
//      crée un upload direct Mux, story en status='uploading' ; le webhook
//      /api/webhooks/mux la passe en 'active' après encodage (HLS adaptatif).
//
// Auth : Bearer token Supabase (vendeur connecté).
// Réponse A : { ok, storyId }     Réponse B : { ok, storyId, uploadId, uploadUrl }
//
// Variables : SUPABASE_URL, SUPABASE_SERVICE_KEY [, MUX_TOKEN_ID, MUX_TOKEN_SECRET].
import { ok, err, corsOptions } from '../_lib/response.js';

async function sbUser(env, token) {
  try {
    const r = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${token}` },
    });
    return r.ok ? await r.json() : null;
  } catch { return null; }
}

// Insert d'une story via la service key (bypasse le RLS de la table).
async function insertStory(env, fields) {
  const r = await fetch(`${env.SUPABASE_URL}/rest/v1/stories`, {
    method: 'POST',
    headers: {
      apikey: env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json', Prefer: 'return=representation',
    },
    body: JSON.stringify(fields),
  });
  if (!r.ok) { const t = await r.text().catch(() => 'HTTP ' + r.status); throw new Error(t); }
  const rows = await r.json();
  return Array.isArray(rows) && rows[0] ? rows[0].id : null;
}

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method === 'OPTIONS') return corsOptions();
  if (request.method !== 'POST') return err('POST uniquement', 405);
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_KEY) return err('Configuration Supabase incomplète', 503);

  const auth = request.headers.get('Authorization') || '';
  if (!auth.startsWith('Bearer ')) return err('Token manquant', 401);
  const user = await sbUser(env, auth.slice(7));
  if (!user || !user.id) return err('Token invalide', 401);

  let body = {};
  try { body = await request.json(); } catch { /* optionnel */ }
  const title = (body.title || '').toString().slice(0, 140);
  const productId = body.productId || null;
  const category = (body.category || '').toString().slice(0, 60) || null;
  const city = (body.city || 'Dakar').toString().slice(0, 60);
  // Prix de vente de la story (EUR ; convention NEXUS). null = pas de prix affiché.
  let price = null;
  if (body.price != null && body.price !== '') {
    const p = Number(body.price);
    if (isFinite(p) && p > 0) price = p;
  }
  const allowOffers = body.allowOffers === false ? false : true;
  const vendorName = (user.user_metadata && user.user_metadata.name) || user.email || 'Vendeur';

  // ── MODE A : DIRECT (vidéo déjà dans Storage, URL fournie) ──────────────────
  const videoUrl = (body.videoUrl || '').toString().trim();
  if (videoUrl) {
    // Sécurité : n'accepter que des URLs https du Storage Supabase de CE projet
    // (évite d'enregistrer une story pointant vers un domaine arbitraire).
    let host = '';
    try { host = new URL(videoUrl).host; } catch { return err('videoUrl invalide', 400); }
    let projectHost = '';
    try { projectHost = new URL(env.SUPABASE_URL).host; } catch {}
    if (!videoUrl.startsWith('https://') || (projectHost && host !== projectHost)) {
      return err('videoUrl doit être une URL Supabase Storage de ce projet', 400);
    }
    try {
      const storyId = await insertStory(env, {
        vendor_id: user.id, vendor_name: vendorName,
        product_id: productId, title, category, city,
        video_url: videoUrl, status: 'active',
        price, allow_offers: allowOffers,
      });
      if (!storyId) return err('Story non enregistrée', 502);
      return ok({ ok: true, storyId });
    } catch (e) {
      return err('Story non enregistrée : ' + (e.message || e), 502);
    }
  }

  // ── MODE B : MUX (encodage adaptatif, si configuré) ─────────────────────────
  if (!env.MUX_TOKEN_ID || !env.MUX_TOKEN_SECRET) {
    return err('Aucune vidéo fournie. (Mode direct attendu : champ videoUrl.)', 400);
  }

  // 1) Créer l'upload direct Mux
  let mux;
  try {
    const basic = btoa(`${env.MUX_TOKEN_ID}:${env.MUX_TOKEN_SECRET}`);
    const r = await fetch('https://api.mux.com/video/v1/uploads', {
      method: 'POST',
      headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cors_origin: '*',
        new_asset_settings: { playback_policy: ['public'], encoding_tier: 'baseline' },
      }),
    });
    if (!r.ok) { const dt = await r.text().catch(() => ''); console.warn('[stories] Mux upload error', r.status, dt); return err('Création upload vidéo échouée (Mux ' + r.status + ') : ' + dt.slice(0, 200), 502); }
    mux = (await r.json()).data;
  } catch (e) { return err('Mux indisponible : ' + (e.message || e), 502); }

  // 2) Insérer la story (service key). Si l'insert échoue, on NE renvoie PAS de
  // succès : sinon le client envoie la vidéo à Mux mais aucune story n'existe →
  // rien ne s'affiche jamais (échec silencieux). On remonte l'erreur réelle.
  let storyId = null, insertErr = null;
  try {
    const r = await fetch(`${env.SUPABASE_URL}/rest/v1/stories`, {
      method: 'POST',
      headers: {
        apikey: env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json', Prefer: 'return=representation',
      },
      body: JSON.stringify({
        vendor_id: user.id,
        vendor_name: (user.user_metadata && user.user_metadata.name) || user.email || 'Vendeur',
        product_id: productId, title, category, city,
        mux_upload_id: mux.id, status: 'uploading',
      }),
    });
    if (r.ok) { const rows = await r.json(); storyId = Array.isArray(rows) && rows[0] ? rows[0].id : null; }
    else { insertErr = await r.text().catch(() => 'HTTP ' + r.status); console.warn('[stories] insert KO', r.status, insertErr); }
  } catch (e) { insertErr = e.message; console.warn('[stories] insert', e.message); }

  if (!storyId) return err('Story non enregistrée : ' + (insertErr || 'erreur inconnue'), 502);
  return ok({ ok: true, storyId, uploadId: mux.id, uploadUrl: mux.url });
}
