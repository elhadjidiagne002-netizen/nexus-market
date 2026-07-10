/**
 * NEXUS Market — Cloudflare Pages Function : /api/whatsapp
 * ──────────────────────────────────────────────────────────
 * Instance Green API : 7107631852
 * API URL : https://7107.api.greenapi.com
 * Numéro connecté : +221 77 625 48 95
 *
 * Variables d'environnement Cloudflare Dashboard → Settings → Environment Variables :
 *   GREEN_API_INSTANCE_ID  = (instance Green API)
 *   GREEN_API_TOKEN        = (token Green API — SECRET, à mettre en variable chiffrée)
 *   GREEN_API_BASE_URL     = https://xxxx.api.greenapi.com
 *   NEXUS_WA_SECRET        = (secret partagé — SECRET, à mettre en variable chiffrée)
 */

import { normalizePhone, isValidPhone, isValidMessage } from './_lib/validate.js';
import { rateLimit, clientIp, tooManyRequests } from './_lib/ratelimit.js';
import { getEventConfig, logWhatsApp } from './_lib/notify.js';
import { isInternalCall, requireAuth } from './_lib/utils.js';

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

  // [SEC #7] Authentification. Cet endpoint est appelé UNIQUEMENT serveur→serveur
  // (wa-tracking, cron) — le front parle directement à Green API. On exige donc :
  //   1. l'en-tête X-Internal-Secret (secret serveur, JAMAIS dans le bundle) ; ou
  //   2. un JWT Supabase valide (si un client authentifié venait à l'appeler).
  // L'ancien `body.secret === NEXUS_WA_SECRET` reste accepté en repli DÉPRÉCIÉ
  // (⚠️ NEXUS_WA_SECRET ne doit PAS être la valeur de config WhatsApp côté client,
  //  sinon l'auth est publique). Migrer les appelants vers X-Internal-Secret.
  let authed = isInternalCall(request, env);
  if (!authed && request.headers.get('Authorization')) {
    const [u, e] = await requireAuth(request, env);
    if (!e && u) authed = true;
  }
  if (!authed && env.NEXUS_WA_SECRET && body.secret === env.NEXUS_WA_SECRET) authed = true;
  if (!authed) {
    return json({ ok: false, error: 'Non autorisé' }, 401, corsHeaders);
  }

  // [FIX] Plus de tokens en dur (fuite de secrets) — tout vient de l'environnement.
  const instanceId = env.GREEN_API_INSTANCE_ID;
  const apiToken   = env.GREEN_API_TOKEN;
  const baseUrl    = env.GREEN_API_BASE_URL || 'https://api.greenapi.com';
  if (!instanceId || !apiToken) {
    return json({ ok: false, error: 'Green API non configurée' }, 503, corsHeaders);
  }

  // ── Validation des entrées ──────────────────────────────────────────────
  if (!isValidPhone(body.phone)) {
    return json({ ok: false, error: 'Numéro de téléphone invalide' }, 400, corsHeaders);
  }
  if (!isValidMessage(body.message, 4096)) {
    return json({ ok: false, error: 'Message vide ou trop long (max 4096 caractères)' }, 400, corsHeaders);
  }

  // ── Gating centre de notifications (si un événement est fourni) ─────────
  if (body.event) {
    const cfg = await getEventConfig(env, body.event);
    if (cfg && cfg.whatsapp_enabled === false) {
      return json({ ok: true, skipped: 'event_disabled' }, 200, corsHeaders);
    }
  }

  // ── Rate limiting : 10 messages / minute / IP ───────────────────────────
  const rl = await rateLimit(env, `wa:${clientIp(request)}`, 10, 60);
  if (!rl.allowed) return tooManyRequests(rl.resetAt, corsHeaders);

  // Normaliser le numéro → format 221XXXXXXXXX@c.us
  const raw    = normalizePhone(body.phone);
  const chatId = (raw.startsWith('221') ? raw : raw.length === 9 ? '221' + raw : raw) + '@c.us';
  const logRow = { phone: raw, message: body.message, template: body.event || null, user_id: body.userId || null };

  let res;
  try {
    res = await fetch(`${baseUrl}/waInstance${instanceId}/sendMessage/${apiToken}`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ chatId, message: body.message }),
    });
  } catch(err) {
    await logWhatsApp(env, { ...logRow, status: 'failed', error_msg: 'Green API injoignable : ' + err.message });
    return json({ ok: false, error: 'Green API injoignable : ' + err.message }, 502, corsHeaders);
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    // [FIX] 466 = quota mensuel du plan Developer (gratuit) Green API dépassé —
    // cause vérifiée des échecs d'envoi depuis 2026-06-12 (cf. green-api.com/en/
    // docs/api/466-error-example-body/). Message explicite au lieu de forcer à
    // rechercher la signification d'un code HTTP non-standard à chaque incident.
    const errorMsg = res.status === 466
      ? 'Quota mensuel Green API dépassé (plan Developer/gratuit) — passez sur le plan Business payant sur green-api.com pour rétablir l\'envoi.'
      : 'Green API ' + res.status;
    await logWhatsApp(env, { ...logRow, status: 'failed', error_msg: errorMsg });
    return json({ ok: false, error: errorMsg, detail: data }, res.status, corsHeaders);
  }

  await logWhatsApp(env, { ...logRow, status: 'sent', green_id: data.idMessage || null });
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
