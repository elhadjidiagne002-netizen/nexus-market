/**
 * NEXUS Market — Cloudflare Pages Function : /api/whatsapp
 * ──────────────────────────────────────────────────────────
 * Instance Green API : 7107631852
 * API URL : https://7107.api.greenapi.com
 * Numéro connecté : +221 77 625 48 95
 *
 * Variables d'environnement Cloudflare Dashboard → Settings → Environment Variables :
 *   GREEN_API_INSTANCE_ID  = 7107631852
 *   GREEN_API_TOKEN        = a2aa17093f8843eb932c54d7c775c3f286f498da1cf34e8da7
 *   GREEN_API_BASE_URL     = https://7107.api.greenapi.com
 *   NEXUS_WA_SECRET        = nexus-wa-2026
 */

export async function onRequestPost(ctx) {
  const { request, env } = ctx;

  const corsHeaders = {
    'Access-Control-Allow-Origin':  '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
  if (request.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  let body;
  try { body = await request.json(); }
  catch { return json({ ok: false, error: 'JSON invalide' }, 400, corsHeaders); }

  // Authentification par secret partagé
  const secret = env.NEXUS_WA_SECRET || 'nexus-wa-2026';
  if (body.secret && body.secret !== secret) {
    return json({ ok: false, error: 'Non autorisé' }, 401, corsHeaders);
  }

  const instanceId = env.GREEN_API_INSTANCE_ID || '7107631852';
  const apiToken   = env.GREEN_API_TOKEN       || 'a2aa17093f8843eb932c54d7c775c3f286f498da1cf34e8da7';
  const baseUrl    = env.GREEN_API_BASE_URL    || 'https://7107.api.greenapi.com';

  if (!body.phone || !body.message) {
    return json({ ok: false, error: 'phone et message requis' }, 400, corsHeaders);
  }

  // Normaliser le numéro → format 221XXXXXXXXX@c.us
  const raw    = String(body.phone).replace(/\D/g, '');
  const chatId = (raw.startsWith('221') ? raw : raw.length === 9 ? '221' + raw : raw) + '@c.us';

  let res;
  try {
    res = await fetch(`${baseUrl}/waInstance${instanceId}/sendMessage/${apiToken}`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ chatId, message: body.message }),
    });
  } catch(err) {
    return json({ ok: false, error: 'Green API injoignable : ' + err.message }, 502, corsHeaders);
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) return json({ ok: false, error: 'Green API ' + res.status, detail: data }, res.status, corsHeaders);

  return json({ ok: true, idMessage: data.idMessage, chatId }, 200, corsHeaders);
}

export async function onRequestGet(ctx) {
  return json({
    service:    'NEXUS WhatsApp Gateway',
    instance:   ctx.env.GREEN_API_INSTANCE_ID || '7107631852',
    status:     'ready',
    timestamp:  new Date().toISOString(),
  }, 200, { 'Access-Control-Allow-Origin': '*' });
}

function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...extra },
  });
}
