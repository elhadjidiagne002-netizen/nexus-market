// functions/api/sms/[[route]].js — Feature 15 : SMS OTP via Infobip
// POST /api/sms/send-otp     → envoyer OTP
// POST /api/sms/verify-otp   → vérifier le code
import { options, json, err, supabase } from '../_lib/utils.js';

const OTP_TTL  = 10 * 60 * 1000; // 10 minutes
const MAX_ATTEMPTS = 3;
const RATE_LIMIT   = 3; // max par heure

export async function onRequest({ request, env, params }) {
  if (request.method !== 'POST') return options();
  const sb    = supabase(env);
  const route = Array.isArray(params?.route) ? params.route[0] : (params?.route || '');

  try {
    if (route === 'send-otp')   return sendOtp(request, sb, env);
    if (route === 'verify-otp') return verifyOtp(request, sb, env);
    return err('Route introuvable', 404);
  } catch (e) { return err(e.message, 500); }
}

async function sendOtp(request, sb, env) {
  const body = await request.json().catch(() => ({}));
  const { phone, purpose = 'auth' } = body;
  if (!phone) return err('Numéro de téléphone requis', 400);

  const normalized = normalizePhone(phone);
  if (!normalized) return err('Format téléphone invalide (ex: +221771234567)', 400);

  // Rate-limit : 3 OTP/heure
  const since  = new Date(Date.now() - 3600000).toISOString();
  const recent = await sb.from('otp_codes').select('id', `phone=eq.${normalized}&purpose=eq.${purpose}&created_at=gte.${since}`);
  if ((recent?.length || 0) >= RATE_LIMIT) return err('Trop de tentatives. Réessayez dans 1 heure.', 429);

  // Générer OTP à 6 chiffres
  const code       = String(Math.floor(100000 + Math.random() * 900000));
  const expiresAt  = new Date(Date.now() + OTP_TTL).toISOString();
  const codeHash   = await hashCode(code);

  // Invalider les précédents
  await sb.from('otp_codes').update({ invalidated: true }, `phone=eq.${normalized}&purpose=eq.${purpose}&verified=eq.false`).catch(() => {});

  // Stocker
  await sb.from('otp_codes').insert({
    phone: normalized, purpose, code_hash: codeHash,
    expires_at: expiresAt, attempts: 0, verified: false, invalidated: false,
    created_at: new Date().toISOString(),
  });

  // Envoyer le SMS
  const text   = getOtpText(purpose, code);
  const result = await sendInfobipSms(env, normalized, text);
  if (!result.ok) return err('Échec envoi SMS: ' + result.error, 500);

  return json({ ok: true, phone: maskPhone(normalized), expires_in: OTP_TTL / 1000, dev_code: env.ENVIRONMENT !== 'production' ? code : undefined });
}

async function verifyOtp(request, sb, env) {
  const body = await request.json().catch(() => ({}));
  const { phone, code, purpose = 'auth' } = body;
  if (!phone || !code) return err('phone et code requis', 400);

  const normalized = normalizePhone(phone);
  if (!normalized) return err('Format téléphone invalide', 400);

  const now    = new Date().toISOString();
  const otps   = await sb.from('otp_codes').select('*', `phone=eq.${normalized}&purpose=eq.${purpose}&verified=eq.false&invalidated=eq.false&expires_at=gte.${now}&order=created_at.desc&limit=1`);
  if (!otps?.length) return err('Code expiré ou invalide. Demandez un nouveau code.', 400);
  const otp = otps[0];

  if (otp.attempts >= MAX_ATTEMPTS) {
    await sb.from('otp_codes').update({ invalidated: true }, `id=eq.${otp.id}`);
    return err('Trop de tentatives. Demandez un nouveau code.', 400);
  }

  await sb.from('otp_codes').update({ attempts: otp.attempts + 1 }, `id=eq.${otp.id}`);

  const inputHash = await hashCode(code);
  if (inputHash !== otp.code_hash) {
    const remaining = MAX_ATTEMPTS - otp.attempts - 1;
    return err(`Code incorrect. ${remaining} tentative(s) restante(s).`, 400);
  }

  await sb.from('otp_codes').update({ verified: true, verified_at: new Date().toISOString() }, `id=eq.${otp.id}`);

  return json({ ok: true, verified: true, purpose, phone: maskPhone(normalized) });
}

async function sendInfobipSms(env, to, text) {
  if (!env.INFOBIP_API_KEY || !env.INFOBIP_BASE_URL) {
    // Mode dev : simuler
    if (env.ENVIRONMENT !== 'production') { console.log(`[SMS DEV] ${to}: ${text}`); return { ok: true, simulated: true }; }
    return { ok: false, error: 'INFOBIP_API_KEY non configuré' };
  }

  try {
    const res = await fetch(`https://${env.INFOBIP_BASE_URL}/sms/2/text/advanced`, {
      method: 'POST',
      headers: {
        Authorization: `App ${env.INFOBIP_API_KEY}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        messages: [{ destinations: [{ to }], from: env.INFOBIP_SENDER || 'NexusMarket', text }],
      }),
    });
    if (!res.ok) return { ok: false, error: await res.text() };
    const data = await res.json();
    return { ok: true, message_id: data.messages?.[0]?.messageId };
  } catch (e) { return { ok: false, error: e.message }; }
}

function normalizePhone(phone) {
  const cleaned = phone.toString().replace(/[\s\-().]/g, '');
  if (/^(77|78|70|76|75|33)\d{7}$/.test(cleaned)) return `+221${cleaned}`;
  if (/^\+?221(77|78|70|76|75|33)\d{7}$/.test(cleaned)) return `+221${cleaned.replace(/^\+?221/, '')}`;
  if (/^\+[1-9]\d{7,14}$/.test(cleaned)) return cleaned;
  return null;
}

function maskPhone(phone) { return phone.replace(/(\+\d{3}\d{2}\d{3})\d{4}/, '$1****'); }

function getOtpText(purpose, code) {
  return {
    auth:         `NEXUS Market: Votre code de connexion est ${code}. Valable 10 min.`,
    phone_verify: `NEXUS Market: Code de vérification: ${code}. Valable 10 min.`,
    password:     `NEXUS Market: Code de réinitialisation: ${code}. Valable 10 min.`,
    delivery:     `NEXUS Market: Code de réception colis: ${code}. Confirmez à la livraison.`,
  }[purpose] || `NEXUS Market: Votre code est ${code}. Valable 10 min.`;
}

async function hashCode(code) {
  const data = new TextEncoder().encode(code + 'nexus-otp-salt-2024');
  const buf  = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}
