// functions/api/webhooks/mux.js → POST /api/webhooks/mux
// [NEXUS STORIES] Webhook Mux : à la fin de l'encodage (video.asset.ready), passe
// la story correspondante en 'active' avec son mux_playback_id. Gère aussi les
// erreurs (video.asset.errored). Vérifie la signature si MUX_WEBHOOK_SECRET défini.
//
// Config webhook Mux : Dashboard Mux → Settings → Webhooks → URL =
//   https://nexus-market-asb.pages.dev/api/webhooks/mux
// Variables : SUPABASE_URL, SUPABASE_SERVICE_KEY, MUX_WEBHOOK_SECRET (optionnel).

function sbHeaders(env) {
  return {
    apikey: env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
    'Content-Type': 'application/json', Prefer: 'return=minimal',
  };
}

// Vérifie la signature Mux : header "Mux-Signature: t=<ts>,v1=<hmac>"
// v1 = HMAC_SHA256(secret, `${t}.${rawBody}`). Anti-replay 5 min.
async function verifyMux(secret, header, rawBody) {
  try {
    if (!header) return false;
    const parts = Object.fromEntries(header.split(',').map(kv => kv.split('=')));
    const t = parts.t, v1 = parts.v1;
    if (!t || !v1) return false;
    if (Math.abs(Date.now() / 1000 - Number(t)) > 300) return false; // 5 min
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${t}.${rawBody}`));
    const hex = [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, '0')).join('');
    // comparaison constante
    if (hex.length !== v1.length) return false;
    let diff = 0; for (let i = 0; i < hex.length; i++) diff |= hex.charCodeAt(i) ^ v1.charCodeAt(i);
    return diff === 0;
  } catch { return false; }
}

export async function onRequestPost({ request, env }) {
  const raw = await request.text();

  if (env.MUX_WEBHOOK_SECRET) {
    const okSig = await verifyMux(env.MUX_WEBHOOK_SECRET, request.headers.get('Mux-Signature'), raw);
    if (!okSig) return new Response('signature invalide', { status: 401 });
  }

  let evt;
  try { evt = JSON.parse(raw); } catch { return new Response('json invalide', { status: 400 }); }
  const type = evt.type;
  const data = evt.data || {};

  try {
    if (type === 'video.asset.ready') {
      const uploadId = data.upload_id;
      const playbackId = (data.playback_ids && data.playback_ids[0] && data.playback_ids[0].id) || null;
      if (uploadId && playbackId) {
        await fetch(`${env.SUPABASE_URL}/rest/v1/stories?mux_upload_id=eq.${encodeURIComponent(uploadId)}`, {
          method: 'PATCH', headers: sbHeaders(env),
          body: JSON.stringify({ mux_asset_id: data.id, mux_playback_id: playbackId, duration: data.duration || null, status: 'active' }),
        });
      }
    } else if (type === 'video.asset.errored') {
      const uploadId = data.upload_id;
      if (uploadId) {
        await fetch(`${env.SUPABASE_URL}/rest/v1/stories?mux_upload_id=eq.${encodeURIComponent(uploadId)}`, {
          method: 'PATCH', headers: sbHeaders(env), body: JSON.stringify({ status: 'errored' }),
        });
      }
    }
  } catch (e) { console.warn('[mux webhook]', e.message); }

  return new Response('ok', { status: 200 });
}

export async function onRequestOptions() {
  return new Response(null, { status: 204 });
}
