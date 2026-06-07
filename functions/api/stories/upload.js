// functions/api/stories/upload.js → POST /api/stories/upload
// [NEXUS STORIES] Crée un upload direct Mux et insère la story (status=uploading).
// Le client PUT ensuite le fichier vidéo vers l'URL renvoyée ; le webhook
// /api/webhooks/mux passera la story en 'active' une fois encodée.
//
// Auth : Bearer token Supabase (vendeur connecté).
// Réponse : { ok, storyId, uploadUrl }  (ou 503 si Mux non configuré).
//
// Variables : SUPABASE_URL, SUPABASE_SERVICE_KEY, MUX_TOKEN_ID, MUX_TOKEN_SECRET.
import { ok, err, corsOptions } from '../_lib/response.js';

async function sbUser(env, token) {
  try {
    const r = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${token}` },
    });
    return r.ok ? await r.json() : null;
  } catch { return null; }
}

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method === 'OPTIONS') return corsOptions();
  if (request.method !== 'POST') return err('POST uniquement', 405);
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_KEY) return err('Configuration Supabase incomplète', 503);
  if (!env.MUX_TOKEN_ID || !env.MUX_TOKEN_SECRET) {
    return err('Vidéo non configurée : ajoutez MUX_TOKEN_ID / MUX_TOKEN_SECRET (mux.com).', 503);
  }

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
    if (!r.ok) { console.warn('[stories] Mux upload error', r.status, await r.text().catch(() => '')); return err('Création upload vidéo échouée', 502); }
    mux = (await r.json()).data;
  } catch (e) { return err('Mux indisponible : ' + (e.message || e), 502); }

  // 2) Insérer la story (service key)
  let storyId = null;
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
    const rows = r.ok ? await r.json() : null;
    storyId = Array.isArray(rows) && rows[0] ? rows[0].id : null;
  } catch (e) { console.warn('[stories] insert', e.message); }

  return ok({ ok: true, storyId, uploadId: mux.id, uploadUrl: mux.url });
}
