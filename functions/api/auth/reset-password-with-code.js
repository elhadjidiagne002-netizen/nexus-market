// functions/api/auth/reset-password-with-code.js — POST /api/auth/reset-password-with-code
// Mot de passe oublié — flux code à 6 chiffres (même famille que la
// vérification d'email à l'inscription, réutilise send-verification-code.js
// pour l'envoi). Contrairement au flux "lien" natif Supabase (resetPasswordForEmail
// + updateUser, qui exige une SESSION obtenue via le lien de recovery), ce
// flux n'a besoin d'AUCUNE session : le code prouve la possession de la boîte
// mail, puis le mot de passe est posé directement via l'API admin
// Supabase (PUT /auth/v1/admin/users/{uid}, qui ne demande pas l'ancien
// mot de passe — c'est le mécanisme même des dashboards admin).
//
// Body : { email, code, newPassword }. Public, rate-limité. Le code est
// consommé (checkVerificationCode) : un code ne peut servir qu'une fois,
// que ce soit pour confirmer un email ou réinitialiser un mot de passe.
import { options, err, json } from '../_lib/utils.js';
import { checkVerificationCode, resolveUidByEmail } from '../_lib/email-code.js';
import { rateLimit, tooManyRequests } from '../_lib/ratelimit.js';

export async function onRequestOptions() { return options(); }

export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.json(); } catch { return err('JSON invalide', 400); }
  const email = String(body?.email || '').trim().toLowerCase();
  const code = String(body?.code || '').trim();
  const newPassword = String(body?.newPassword || '');
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return err('Email invalide', 400);
  if (!/^\d{6}$/.test(code)) return err('Code invalide (6 chiffres)', 400);
  if (newPassword.length < 6) return err('Mot de passe trop court (min 6 caractères)', 400);

  const rl = await rateLimit(env, `reset-pw:check:${email}`, 10, 600);
  if (!rl.allowed) return tooManyRequests(rl.resetAt);

  const check = await checkVerificationCode(env, email, code);
  if (!check.ok) return err(check.error, check.status || 400);

  let uid = check.uid;
  if (!uid) uid = await resolveUidByEmail(env, email);
  if (!uid) return err('Compte introuvable pour cet email.', 404);

  try {
    const r = await fetch(`${env.SUPABASE_URL}/auth/v1/admin/users/${uid}`, {
      method: 'PUT',
      headers: {
        apikey: env.SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ password: newPassword, email_confirm: true }),
    });
    if (!r.ok) {
      const d = await r.json().catch(() => ({}));
      return err('Échec de la mise à jour du mot de passe : ' + (d.msg || d.message || r.status), 502);
    }
  } catch (e) {
    return err('Échec de la mise à jour du mot de passe : ' + e.message, 502);
  }

  return json({ ok: true });
}
