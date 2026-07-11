// ============================================================
// functions/api/sms.js — NEXUS Market SMS API
// Cloudflare Pages Function — routes POST /api/sms
//
// [2026-07-11] Les providers PAYANTS (Africa's Talking / Orange / Twilio) ont
// été RETIRÉS au profit de httpSMS : un téléphone Android + SIM sénégalaise
// transforme votre forfait SMS (local, quasi gratuit) en passerelle HTTP.
// Open-source, self-hostable ou SaaS httpsms.com. Analogue au montage WAHA pour
// le WhatsApp. Si non configuré → dégradation propre (le SMS reste optionnel).
//
// Variables Cloudflare Pages → Settings → Environment Variables :
//   HTTPSMS_API_KEY   Clé API httpSMS (SaaS httpsms.com ou instance self-hostée)
//   HTTPSMS_FROM      Numéro du téléphone passerelle en E.164 (ex: +221771234567)
//   HTTPSMS_BASE_URL  (optionnel) URL de l'instance self-hostée, sans slash final
//                     (défaut : https://api.httpsms.com — le SaaS)
//   SUPABASE_URL / SUPABASE_SERVICE_KEY   (vérification du JWT appelant)
// ============================================================

import { isValidPhone, isValidMessage, toE164 } from './_lib/validate.js';
import { rateLimit, clientIp, tooManyRequests } from './_lib/ratelimit.js';
import { requireAuth } from './_lib/utils.js';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });

// ── httpSMS (téléphone Android + SIM comme passerelle) ──────────────────────
// API : POST {base}/v1/messages/send  { content, from, to }  + en-tête x-api-key.
// `to` / `from` en E.164 AVEC le « + » (from = HTTPSMS_FROM déjà au bon format).
async function sendViaHttpSms(to, message, env) {
  const base = (env.HTTPSMS_BASE_URL || 'https://api.httpsms.com').replace(/\/+$/, '');
  const toE164Plus = '+' + toE164(to);
  let res;
  try {
    res = await fetch(`${base}/v1/messages/send`, {
      method: 'POST',
      headers: {
        'x-api-key': env.HTTPSMS_API_KEY,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({ content: message, from: env.HTTPSMS_FROM, to: toE164Plus }),
    });
  } catch (err) {
    return { ok: false, provider: 'httpsms', raw: { error: 'httpSMS injoignable : ' + err.message } };
  }
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, provider: 'httpsms', raw: data };
}

// ── Handler ──────────────────────────────────────────────────
export async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (request.method !== 'POST') return json({ error: 'POST uniquement' }, 405);

  // [SEC #3] Authentification OBLIGATOIRE : sans auth, l'endpoint serait une
  // passerelle SMS ouverte (spam / abus du téléphone passerelle). JWT requis.
  const [, authErr] = await requireAuth(request, env);
  if (authErr) return authErr;

  let body;
  try { body = await request.json(); } catch { return json({ error: 'JSON invalide' }, 400); }

  const { phone, message } = body;
  if (!phone || !message) return json({ error: 'phone et message requis' }, 400);

  // ── Validation des entrées (anti-abus / injection) ──────────────────────
  if (!isValidPhone(phone)) return json({ error: 'Numéro de téléphone invalide' }, 400);
  if (!isValidMessage(message, 1000)) {
    return json({ error: 'Message vide ou trop long (max 1000 caractères)' }, 400);
  }

  // ── Rate limiting : 5 SMS / minute / IP (une SIM = débit limité) ─────────
  const rl = await rateLimit(env, `sms:${clientIp(request)}`, 5, 60);
  if (!rl.allowed) return tooManyRequests(rl.resetAt, CORS);

  // httpSMS non configuré : SMS optionnel → on dégrade proprement (200) plutôt
  // que 503, pour ne pas faire échouer le flux appelant (ex. commande).
  if (!(env.HTTPSMS_API_KEY && env.HTTPSMS_FROM)) {
    return json({ ok: false, skipped: 'sms_not_configured' }, 200);
  }

  try {
    const result = await sendViaHttpSms(phone, message, env);
    if (!result.ok) {
      console.error('[SMS] Échec httpSMS:', result.status, JSON.stringify(result.raw));
      // Détail renvoyé à l'appelant (auth admin requis) pour diagnostiquer :
      // téléphone hors-ligne, `from` ≠ numéro enregistré, clé invalide, quota…
      const detail = (result.raw && (result.raw.message || result.raw.error || (result.raw.data && result.raw.data.message))) || result.raw;
      return json({ error: 'Échec envoi SMS', provider: result.provider, httpsms_status: result.status, detail }, 502);
    }
    return json({ ok: true, provider: result.provider });
  } catch (err) {
    console.error('[SMS] Exception:', err.message);
    return json({ error: err.message }, 500);
  }
}
