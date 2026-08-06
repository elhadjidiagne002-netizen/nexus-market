// functions/api/auth/verify-code.js — POST /api/auth/verify-code
// Vérifie le code à 6 chiffres envoyé par send-verification-code.js (flux
// INSCRIPTION). En cas de succès : confirme l'email côté Supabase Auth (via
// l'API admin — sans ça signInWithPassword continuerait à échouer avec
// "email not confirmed") et met à jour profiles.email_confirmed.
//
// Body : { email, code }. Public. Rate-limité ; la protection anti brute-force
// (tentatives, expiration) vit dans checkVerificationCode (_lib/email-code.js).
import { options, err, json, supabase } from '../_lib/utils.js';
import { checkVerificationCode, resolveUidByEmail } from '../_lib/email-code.js';
import { rateLimit, tooManyRequests } from '../_lib/ratelimit.js';

export async function onRequestOptions() { return options(); }

export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.json(); } catch { return err('JSON invalide', 400); }
  const email = String(body?.email || '').trim().toLowerCase();
  const code = String(body?.code || '').trim();
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return err('Email invalide', 400);
  if (!/^\d{6}$/.test(code)) return err('Code invalide (6 chiffres)', 400);

  const rl = await rateLimit(env, `verify-code:check:${email}`, 10, 600);
  if (!rl.allowed) return tooManyRequests(rl.resetAt);

  const check = await checkVerificationCode(env, email, code);
  if (!check.ok) return err(check.error, check.status || 400);

  // ── Confirme l'email côté Supabase Auth (admin API) ────────────────────────
  const sb = supabase(env);
  let uid = check.uid;
  try {
    if (!uid) uid = await resolveUidByEmail(env, email);
    if (uid) {
      await fetch(`${env.SUPABASE_URL}/auth/v1/admin/users/${uid}`, {
        method: 'PUT',
        headers: {
          apikey: env.SUPABASE_SERVICE_KEY,
          Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email_confirm: true }),
      });
      await sb.from('profiles').update({ email_confirmed: true, email_confirmed_at: new Date().toISOString() }, `id=eq.${uid}`).catch(() => {});
    }
  } catch (e) {
    // Le code EST validé — mais la confirmation Auth a échoué. Signalé
    // explicitement plutôt qu'un faux succès : le client réessaiera signInWithPassword.
    return json({ ok: true, authConfirmed: false, warning: 'Code validé, mais activation du compte incomplète : ' + e.message });
  }

  return json({ ok: true, authConfirmed: true });
}
