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
 *
 * [FALLBACK WAHA] Green API a un quota mensuel strict sur le plan gratuit
 * (cf. erreur 466, memory whatsapp-green-api-quota-466). Pour ne plus jamais
 * dépendre d'un seul fournisseur, tout échec Green API (quota dépassé,
 * instance déconnectée, panne réseau...) bascule automatiquement sur une
 * instance WAHA (WhatsApp HTTP API, self-hosted — https://waha.devlike.pro),
 * SI elle est configurée. Sans ces variables, comportement inchangé
 * (Green API seul, comme avant) :
 *   WAHA_BASE_URL  = https://votre-instance-waha.example.com (SANS slash final)
 *   WAHA_API_KEY   = (clé API WAHA — SECRET)
 *   WAHA_SESSION   = default (nom de la session WhatsApp WAHA, optionnel)
 */

import { normalizePhone, isValidPhone, isValidMessage } from './_lib/validate.js';
import { rateLimit, clientIp, tooManyRequests } from './_lib/ratelimit.js';
import { getEventConfig, logWhatsApp } from './_lib/notify.js';
import { isInternalCall, requireAuth } from './_lib/utils.js';
// Logique d'envoi (Green API + repli WAHA) partagée avec sendEventWhatsApp
// (notify.js), qui appelle l'envoi en process depuis les autres functions
// serveur sans repasser par un fetch HTTP vers cet endpoint.
import { sendViaGreenApi, sendViaWaha } from './_lib/wa-send.js';

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
  // Au moins UN des deux fournisseurs (Green API ou WAHA) doit être configuré.
  const greenConfigured = !!(env.GREEN_API_INSTANCE_ID && env.GREEN_API_TOKEN);
  const wahaConfigured  = !!(env.WAHA_BASE_URL && env.WAHA_API_KEY);
  if (!greenConfigured && !wahaConfigured) {
    return json({ ok: false, error: 'Aucun fournisseur WhatsApp configuré (Green API ni WAHA)' }, 503, corsHeaders);
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

  // ── Envoi : Green API en priorité, bascule automatique sur WAHA si Green
  //    API échoue (quota 466, instance déconnectée, panne réseau...) et que
  //    WAHA est configuré. Sans WAHA configuré : comportement inchangé.
  let result = null;
  let providerUsed = null;
  let greenError = null;

  if (greenConfigured) {
    result = await sendViaGreenApi(env, { chatId, message: body.message });
    providerUsed = 'green-api';
    if (!result.ok) greenError = result;
  }

  if ((!result || !result.ok) && wahaConfigured) {
    const wahaResult = await sendViaWaha(env, { chatId, message: body.message });
    providerUsed = 'waha';
    result = wahaResult;
  }

  if (!result || !result.ok) {
    // Les deux fournisseurs (ou le seul configuré) ont échoué.
    const primaryMsg = greenError
      ? (greenError.httpStatus === 466
          ? 'Quota mensuel Green API dépassé (plan Developer/gratuit) — passez sur le plan Business payant sur green-api.com.'
          : greenError.error)
      : null;
    const errorMsg = [primaryMsg, result && result.error].filter(Boolean).join(' | ') || 'Échec de l\'envoi WhatsApp';
    await logWhatsApp(env, {
      ...logRow, status: 'failed', error_msg: errorMsg,
      context: { provider_attempted: providerUsed, green_configured: greenConfigured, waha_configured: wahaConfigured },
    });
    return json({ ok: false, error: errorMsg, detail: result && result.detail }, 502, corsHeaders);
  }

  // [OBSERVABILITÉ] provider dans `context` (pas de colonne dédiée) pour repérer
  // en un coup d'œil si WAHA a dû prendre le relais de Green API.
  await logWhatsApp(env, {
    ...logRow, status: 'sent', green_id: result.id || null,
    context: { provider: providerUsed, fallback: providerUsed === 'waha' },
  });
  return json({ ok: true, idMessage: result.id, chatId, provider: providerUsed }, 200, corsHeaders);
}

export async function onRequestGet(ctx) {
  const env = ctx.env;
  return json({
    service:         'NEXUS WhatsApp Gateway',
    instance:        env.GREEN_API_INSTANCE_ID || '7107631852',
    greenApiReady:   !!(env.GREEN_API_INSTANCE_ID && env.GREEN_API_TOKEN),
    wahaReady:       !!(env.WAHA_BASE_URL && env.WAHA_API_KEY),
    status:          'ready',
    timestamp:       new Date().toISOString(),
  }, 200, { 'Access-Control-Allow-Origin': '*' });
}

function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...extra },
  });
}
