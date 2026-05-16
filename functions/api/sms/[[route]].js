// Feature 15 : SMS OTP via Infobip
import { options, json, err, supabase } from '../_lib/utils.js';

export async function onRequest({ request, env, params }) {
  if (request.method !== 'POST') return options();
  const sb    = supabase(env);
  const route = Array.isArray(params?.route) ? params.route[0] : (params?.route || '');
  try {
    if (route === 'send-otp') {
      const { phone, purpose = 'auth' } = await request.json().catch(() => ({}));
      if (!phone) return err('Numéro de téléphone requis', 400);
      const num = norm(phone);
      if (!num) return err('Format invalide (ex: +221771234567)', 400);
      const since  = new Date(Date.now() - 3600000).toISOString();
      const recent = await sb.from('otp_codes').select('id', `phone=eq.${num}&purpose=eq.${purpose}&created_at=gte.${since}`);
      if ((recent?.length||0) >= 3) return err('Trop de tentatives. Réessayez dans 1h.', 429);
      const code = String(Math.floor(100000 + Math.random() * 900000));
      const hash = await sha256(code + 'nexus-otp-2024');
      await sb.from('otp_codes').update({ invalidated: true }, `phone=eq.${num}&purpose=eq.${purpose}&verified=eq.false`).catch(() => {});
      await sb.from('otp_codes').insert({ phone: num, purpose, code_hash: hash,
        expires_at: new Date(Date.now() + 600000).toISOString(),
        attempts: 0, verified: false, invalidated: false, created_at: new Date().toISOString() });
      const text = { auth:`NEXUS Market: Code connexion ${code}. 10 min.`, phone_verify:`NEXUS: Vérification ${code}. 10 min.`,
        delivery:`NEXUS: Code réception colis ${code}.` }[purpose] || `NEXUS Market: Code ${code}. 10 min.`;
      const sent = await sendSms(env, num, text);
      if (!sent.ok) return err('Échec envoi SMS: ' + sent.error, 500);
      return json({ ok: true, phone: num.replace(/(\+\d{3}\d{2}\d{3})\d{4}/,'$1****'),
        expires_in: 600, ...(env.ENVIRONMENT !== 'production' && { dev_code: code }) });
    }
    if (route === 'verify-otp') {
      const { phone, code, purpose = 'auth' } = await request.json().catch(() => ({}));
      if (!phone || !code) return err('phone et code requis', 400);
      const num  = norm(phone);
      const now  = new Date().toISOString();
      const otps = await sb.from('otp_codes').select('*',
        `phone=eq.${num}&purpose=eq.${purpose}&verified=eq.false&invalidated=eq.false&expires_at=gte.${now}&order=created_at.desc&limit=1`);
      if (!otps?.length) return err('Code expiré. Demandez un nouveau.', 400);
      const otp = otps[0];
      if (otp.attempts >= 3) {
        await sb.from('otp_codes').update({ invalidated: true }, `id=eq.${otp.id}`);
        return err('Trop de tentatives.', 400);
      }
      await sb.from('otp_codes').update({ attempts: otp.attempts + 1 }, `id=eq.${otp.id}`);
      if (await sha256(code + 'nexus-otp-2024') !== otp.code_hash)
        return err(`Code incorrect. ${3-otp.attempts-1} tentative(s) restante(s).`, 400);
      await sb.from('otp_codes').update({ verified: true, verified_at: now }, `id=eq.${otp.id}`);
      return json({ ok: true, verified: true, purpose });
    }
    return err('Route introuvable', 404);
  } catch (e) { return err(e.message, 500); }
}

function norm(p) {
  const c = p.toString().replace(/[\s\-().]/g,'');
  if (/^(77|78|70|76|75|33)\d{7}$/.test(c)) return `+221${c}`;
  if (/^\+?221(77|78|70|76|75|33)\d{7}$/.test(c)) return `+221${c.replace(/^\+?221/,'')}`;
  if (/^\+[1-9]\d{7,14}$/.test(c)) return c;
  return null;
}

async function sha256(s) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('');
}

async function sendSms(env, to, text) {
  if (!env.INFOBIP_API_KEY) {
    if (env.ENVIRONMENT !== 'production') { console.log(`[SMS DEV] ${to}: ${text}`); return { ok: true, simulated: true }; }
    return { ok: false, error: 'INFOBIP_API_KEY manquant' };
  }
  try {
    const res = await fetch(`https://${env.INFOBIP_BASE_URL}/sms/2/text/advanced`, {
      method: 'POST',
      headers: { Authorization: `App ${env.INFOBIP_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [{ destinations: [{ to }], from: env.INFOBIP_SENDER||'NexusMarket', text }] }),
    });
    return res.ok ? { ok: true } : { ok: false, error: await res.text() };
  } catch (e) { return { ok: false, error: e.message }; }
}
