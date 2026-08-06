// functions/api/auth/verify-code.js — POST /api/auth/verify-code
// Vérifie le code à 6 chiffres envoyé par send-verification-code.js. En cas de
// succès : marque le code utilisé, confirme l'email côté Supabase Auth (via
// l'API admin — sans ça signInWithPassword continuerait à échouer avec
// "email not confirmed") et met à jour profiles.email_confirmed.
//
// Body : { email, code }. Public. Rate-limité + compteur de tentatives par
// code (anti brute-force sur un espace à 6 chiffres).
import { options, err, json, supabase } from '../_lib/utils.js';
import { sha256hex, timingSafeEqual } from '../_lib/webhook-utils.js';
import { rateLimit, tooManyRequests } from '../_lib/ratelimit.js';

const MAX_ATTEMPTS = 5;

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

  const sb = supabase(env);
  let row;
  try {
    const rows = await sb.from('email_verification_codes').select('id,user_id,code_hash,attempts,expires_at,verified_at',
      `email=eq.${encodeURIComponent(email)}&verified_at=is.null&order=created_at.desc&limit=1`);
    row = Array.isArray(rows) && rows[0];
  } catch (e) {
    return err('Lecture impossible : ' + e.message, 502);
  }
  if (!row) return err('Aucun code en attente pour cet email — demandez-en un nouveau.', 404);
  if (new Date(row.expires_at) < new Date()) return err('Code expiré — demandez-en un nouveau.', 410);
  if (row.attempts >= MAX_ATTEMPTS) return err('Trop de tentatives — demandez un nouveau code.', 429);

  const givenHash = await sha256hex(code);
  const valid = timingSafeEqual(givenHash, row.code_hash);

  if (!valid) {
    try { await sb.from('email_verification_codes').update({ attempts: row.attempts + 1 }, `id=eq.${row.id}`); } catch (_) {}
    return err('Code incorrect.', 400);
  }

  try { await sb.from('email_verification_codes').update({ verified_at: new Date().toISOString() }, `id=eq.${row.id}`); } catch (_) {}

  // ── Confirme l'email côté Supabase Auth (admin API) ────────────────────────
  // Indispensable : sans email_confirmed_at sur auth.users, signInWithPassword
  // continue de refuser la connexion même si NOUS considérons le compte vérifié.
  let uid = row.user_id;
  try {
    if (!uid) {
      const r = await fetch(`${env.SUPABASE_URL}/auth/v1/admin/users?email=${encodeURIComponent(email)}`, {
        headers: { apikey: env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}` },
      });
      const d = await r.json().catch(() => null);
      uid = d?.users?.[0]?.id || d?.[0]?.id || null;
    }
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
    // Le code EST validé (verified_at posé) — mais la confirmation Auth a échoué.
    // On le signale explicitement plutôt que de renvoyer un faux succès : le
    // client pourra réessayer signInWithPassword, qui échouera proprement.
    return json({ ok: true, authConfirmed: false, warning: 'Code validé, mais activation du compte incomplète : ' + e.message });
  }

  return json({ ok: true, authConfirmed: true });
}
