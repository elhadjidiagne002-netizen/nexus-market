// ============================================================
// functions/api/sms.js — NEXUS Market SMS API
// Cloudflare Pages Function — routes GET/POST /api/sms
//
// Variables Cloudflare Pages → Settings → Environment Variables :
//   SMS_PROVIDER          at | orange | twilio  (défaut: at)
//   AT_API_KEY            Africa's Talking API key
//   AT_USERNAME           Africa's Talking username (sandbox = "sandbox")
//   AT_SENDER_ID          Identifiant expéditeur (ex: NEXUS)
//   ORANGE_CLIENT_ID      Orange SMS API client_id
//   ORANGE_CLIENT_SECRET  Orange SMS API client_secret
//   ORANGE_SENDER_ADDRESS Orange sender address (ex: tel:+221XXXXXXXXX)
//   TWILIO_ACCOUNT_SID    Twilio Account SID
//   TWILIO_AUTH_TOKEN     Twilio Auth Token
//   TWILIO_FROM           Numéro Twilio (ex: +15XXXXXXXXX)
//   SUPABASE_URL          Pour vérifier le JWT
//   SUPABASE_SERVICE_KEY
// ============================================================

import { isValidPhone, isValidMessage } from './_lib/validate.js';
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

// ── Africa's Talking ────────────────────────────────────────
async function sendViaAT(to, message, env) {
  const params = new URLSearchParams({
    username: env.AT_USERNAME || 'sandbox',
    to,
    message,
    ...(env.AT_SENDER_ID ? { from: env.AT_SENDER_ID } : {}),
  });

  const res = await fetch('https://api.africastalking.com/version1/messaging', {
    method: 'POST',
    headers: {
      'apiKey': env.AT_API_KEY,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/json',
    },
    body: params.toString(),
  });

  const data = await res.json();
  const recipients = data?.SMSMessageData?.Recipients || [];
  const ok = recipients.some(r => r.statusCode === 101);
  return { ok, provider: 'africas_talking', raw: data };
}

// ── Orange SMS (Sénégal) ────────────────────────────────────
async function sendViaOrange(to, message, env) {
  // 1. Obtenir un token
  const tokenRes = await fetch('https://api.orange.com/oauth/v3/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: env.ORANGE_CLIENT_ID,
      client_secret: env.ORANGE_CLIENT_SECRET,
    }),
  });
  const { access_token } = await tokenRes.json();

  // 2. Envoyer le SMS
  const smsRes = await fetch('https://api.orange.com/smsmessaging/v1/outbound/' +
    encodeURIComponent(env.ORANGE_SENDER_ADDRESS) + '/requests', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      outboundSMSMessageRequest: {
        address: `tel:${to}`,
        senderAddress: env.ORANGE_SENDER_ADDRESS,
        outboundSMSTextMessage: { message },
      },
    }),
  });

  const ok = smsRes.ok;
  return { ok, provider: 'orange', raw: await smsRes.json().catch(() => ({})) };
}

// ── Twilio ──────────────────────────────────────────────────
async function sendViaTwilio(to, message, env) {
  const auth = btoa(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`);
  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/Messages.json`,
    {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ To: to, From: env.TWILIO_FROM, Body: message }),
    }
  );
  const data = await res.json();
  return { ok: !!data.sid, provider: 'twilio', raw: data };
}

// ── Dispatcher ──────────────────────────────────────────────
async function sendSms(to, message, env) {
  const provider = (env.SMS_PROVIDER || 'at').toLowerCase();
  switch (provider) {
    case 'orange': return sendViaOrange(to, message, env);
    case 'twilio': return sendViaTwilio(to, message, env);
    default:       return sendViaAT(to, message, env);
  }
}

// ── Handler ──────────────────────────────────────────────────
export async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (request.method !== 'POST') return json({ error: 'POST uniquement' }, 405);

  // [SEC #3] Authentification OBLIGATOIRE : l'envoi de SMS coûte de l'argent
  // (Africa's Talking / Orange / Twilio). Sans auth, l'endpoint était une
  // passerelle SMS ouverte (drainage de crédit / spam). On exige un JWT valide.
  const [, authErr] = await requireAuth(request, env);
  if (authErr) return authErr;

  let body;
  try { body = await request.json(); } catch { return json({ error: 'JSON invalide' }, 400); }

  const { phone, message, senderId } = body;
  if (!phone || !message) return json({ error: 'phone et message requis' }, 400);

  // ── Validation des entrées (anti-abus / injection) ──────────────────────
  if (!isValidPhone(phone)) return json({ error: 'Numéro de téléphone invalide' }, 400);
  if (!isValidMessage(message, 1000)) {
    return json({ error: 'Message vide ou trop long (max 1000 caractères)' }, 400);
  }

  // ── Rate limiting : 5 SMS / minute / IP ─────────────────────────────────
  const rl = await rateLimit(env, `sms:${clientIp(request)}`, 5, 60);
  if (!rl.allowed) return tooManyRequests(rl.resetAt, CORS);

  // Vérifier qu'au moins un provider est configuré
  const hasAT     = !!(env.AT_API_KEY);
  const hasOrange = !!(env.ORANGE_CLIENT_ID && env.ORANGE_CLIENT_SECRET);
  const hasTwilio = !!(env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN);

  if (!hasAT && !hasOrange && !hasTwilio) {
    // SMS optionnel et non configuré : on dégrade proprement (200) plutôt que 503,
    // pour ne pas polluer la console et ne pas faire échouer le flux commande.
    return json({ ok: false, skipped: 'sms_not_configured' }, 200);
  }

  try {
    const result = await sendSms(phone, message, env);
    if (!result.ok) {
      console.error('[SMS] Échec provider:', JSON.stringify(result.raw));
      return json({ error: 'Échec envoi SMS', provider: result.provider }, 502);
    }
    return json({ ok: true, provider: result.provider });
  } catch (err) {
    console.error('[SMS] Exception:', err.message);
    return json({ error: err.message }, 500);
  }
}
