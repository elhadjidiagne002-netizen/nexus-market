// functions/api/auth/send-verification-code.js — POST /api/auth/send-verification-code
// Génère un code à 6 chiffres, le stocke (hashé, jamais en clair) et l'envoie
// par email (+ WhatsApp si téléphone dispo) — vérification d'email à
// l'inscription façon "grands sites" (Amazon, etc.), en complément du lien
// natif Supabase Auth déjà en place.
//
// Body : { email, name?, phone?, userId? }. Public (appelé juste après
// signUp() côté client, avant toute session) — rate-limité par email + IP
// pour empêcher le spam d'un tiers vers une boîte mail qu'il ne possède pas.
import { options, err, supabase } from '../_lib/utils.js';
import { sha256hex } from '../_lib/webhook-utils.js';
import { sendEventNotification } from '../_lib/notify.js';
import { rateLimit, clientIp, tooManyRequests } from '../_lib/ratelimit.js';
import { isValidPhone } from '../_lib/validate.js';

function genCode() {
  // 6 chiffres, jamais commençant par 0 côté affichage n'a pas d'importance ici.
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return String(100000 + (buf[0] % 900000));
}

export async function onRequestOptions() { return options(); }

export async function onRequestPost(context) {
  const { request, env } = context;
  let body;
  try { body = await request.json(); } catch { return err('JSON invalide', 400); }
  const email = String(body?.email || '').trim().toLowerCase();
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return err('Email invalide', 400);
  const name = String(body?.name || '').trim().slice(0, 80) || 'Cher client';
  const phone = isValidPhone(body?.phone) ? body.phone : null;
  const userId = body?.userId || null;

  // Anti-abus : 3 envois / 10 min par email, 10 / 10 min par IP.
  const rlEmail = await rateLimit(env, `verify-code:email:${email}`, 3, 600);
  if (!rlEmail.allowed) return tooManyRequests(rlEmail.resetAt);
  const rlIp = await rateLimit(env, `verify-code:ip:${clientIp(request)}`, 10, 600);
  if (!rlIp.allowed) return tooManyRequests(rlIp.resetAt);

  const code = genCode();
  const codeHash = await sha256hex(code);
  const sb = supabase(env);

  try {
    await sb.from('email_verification_codes').insert({
      user_id: userId,
      email,
      code_hash: codeHash,
      expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    });
  } catch (e) {
    return err('Échec de la génération du code : ' + e.message, 502);
  }

  // Best-effort, ne bloque jamais la réponse — MAIS doit survivre au-delà du
  // `return` ci-dessous : sans context.waitUntil(), Cloudflare Workers peut
  // tuer cette promesse non attendue dès que la réponse HTTP est renvoyée,
  // avant même l'appel réel à Resend/Brevo (bug trouvé le 2026-08-30 : le
  // code était bien généré/stocké mais aucune ligne n'apparaissait jamais
  // dans email_logs — ni "sent" ni "failed" — signe que l'envoi n'était
  // jamais exécuté jusqu'au bout, pas qu'il échouait).
  const notifyPromise = sendEventNotification(env, 'email_verify_code', { email, phone, userId }, { name, code }).catch(() => {});
  if (typeof context.waitUntil === 'function') context.waitUntil(notifyPromise);
  else await notifyPromise;

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
}
