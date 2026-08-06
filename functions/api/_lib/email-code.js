// functions/api/_lib/email-code.js
// Logique partagée de vérification d'un code à 6 chiffres (table
// email_verification_codes) — utilisée par verify-code.js (inscription) et
// reset-password-with-code.js (mot de passe oublié). Ne fait AUCUN effet de
// bord métier (ni confirmation Auth, ni changement de mot de passe) : les
// appelants décident quoi faire une fois le code validé.
import { sha256hex, timingSafeEqual } from './webhook-utils.js';
import { supabase } from './utils.js';

const MAX_ATTEMPTS = 5;

/**
 * @returns {Promise<{ok:boolean, uid?:string|null, rowId?:string, error?:string, status?:number}>}
 */
export async function checkVerificationCode(env, email, code) {
  const sb = supabase(env);
  let row;
  try {
    const rows = await sb.from('email_verification_codes').select('id,user_id,code_hash,attempts,expires_at,verified_at',
      `email=eq.${encodeURIComponent(email)}&verified_at=is.null&order=created_at.desc&limit=1`);
    row = Array.isArray(rows) && rows[0];
  } catch (e) {
    return { ok: false, error: 'Lecture impossible : ' + e.message, status: 502 };
  }
  if (!row) return { ok: false, error: 'Aucun code en attente pour cet email — demandez-en un nouveau.', status: 404 };
  if (new Date(row.expires_at) < new Date()) return { ok: false, error: 'Code expiré — demandez-en un nouveau.', status: 410 };
  if (row.attempts >= MAX_ATTEMPTS) return { ok: false, error: 'Trop de tentatives — demandez un nouveau code.', status: 429 };

  const givenHash = await sha256hex(code);
  const valid = timingSafeEqual(givenHash, row.code_hash);
  if (!valid) {
    try { await sb.from('email_verification_codes').update({ attempts: row.attempts + 1 }, `id=eq.${row.id}`); } catch (_) {}
    return { ok: false, error: 'Code incorrect.', status: 400 };
  }

  try { await sb.from('email_verification_codes').update({ verified_at: new Date().toISOString() }, `id=eq.${row.id}`); } catch (_) {}
  return { ok: true, uid: row.user_id || null, rowId: row.id };
}

/** Résout l'uid Supabase Auth par email (API admin) — utilisé quand le code n'a pas d'user_id. */
export async function resolveUidByEmail(env, email) {
  try {
    const r = await fetch(`${env.SUPABASE_URL}/auth/v1/admin/users?email=${encodeURIComponent(email)}`, {
      headers: { apikey: env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}` },
    });
    const d = await r.json().catch(() => null);
    return d?.users?.[0]?.id || d?.[0]?.id || null;
  } catch (_) { return null; }
}
