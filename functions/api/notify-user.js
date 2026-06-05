// functions/api/notify-user.js
// POST /api/notify-user — envoie un email d'événement à un utilisateur identifié
// par son UUID (profiles.id), dont l'adresse est résolue côté serveur.
// Évite d'exposer les emails au frontend. Auth requise + whitelist + rate limit.
import { options, json, err, requireAuth, supabase } from './_lib/utils.js';
import { rateLimit, clientIp, tooManyRequests } from './_lib/ratelimit.js';
import { sendEventEmail } from './_lib/notify.js';

// Événements autorisés à cibler un utilisateur arbitraire (par son id).
const ALLOWED = new Set([
  'quote_request', 'product_moderated', 'low_stock', 'vendor_new_order',
  'payout_requested', 'payout_processed', 'payout_failed',
]);

export async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') return options();
  if (request.method !== 'POST') return err('POST requis', 405);

  const [user, authError] = await requireAuth(request, env);
  if (authError) return authError;
  if (!env.RESEND_API_KEY) return json({ ok: true, skipped: 'no_resend' });

  let body;
  try { body = await request.json(); } catch { return err('JSON invalide', 400); }
  const { event, userId, vars } = body || {};
  if (!ALLOWED.has(event)) return err('Événement non autorisé', 400);
  if (!userId || !/^[0-9a-f-]{36}$/i.test(String(userId))) return err('userId invalide', 400);

  const rl = await rateLimit(env, `notifuser:${clientIp(request)}`, 30, 60);
  if (!rl.allowed) return tooManyRequests(rl.resetAt);

  // Résolution de l'email destinataire (profiles.email).
  let to = null;
  try {
    const sb = supabase(env);
    const rows = await sb.from('profiles').select('email,name', `id=eq.${encodeURIComponent(userId)}`);
    const p = Array.isArray(rows) && rows[0];
    if (p) { to = p.email; if (p.name && vars && vars.vendor_name == null) vars.vendor_name = p.name; }
  } catch (_) {}
  if (!to) return json({ ok: true, skipped: 'no_recipient' });

  const r = await sendEventEmail(env, event, to, { ...(vars && typeof vars === 'object' ? vars : {}), _userId: userId });
  return json({ ok: !!(r && (r.ok || r.skipped)), result: r });
}
