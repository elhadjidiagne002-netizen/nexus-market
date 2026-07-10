// functions/api/notify-admin.js
// POST /api/notify-admin — déclenche un email d'alerte vers l'admin (env.ADMIN_EMAIL).
// Permet au frontend d'émettre les événements admin (admin_new_vendor,
// admin_new_dispute, …) sans connaître l'adresse admin. Auth requise + rate limit.
import { options, json, err, requireAuth } from './_lib/utils.js';
import { rateLimit, clientIp, tooManyRequests } from './_lib/ratelimit.js';
import { sendEventNotification } from './_lib/notify.js';

const ALLOWED = new Set([
  'admin_new_vendor', 'admin_new_dispute', 'admin_payout_request',
]);

export async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') return options();
  if (request.method !== 'POST') return err('POST requis', 405);

  const [user, authError] = await requireAuth(request, env);
  if (authError) return authError;

  // ADMIN_PHONE (optionnel) : envoie aussi le message WhatsApp équivalent à
  // l'admin, en plus de l'email ADMIN_EMAIL — généralisation du centre de
  // notifications aux événements admin.
  if (!env.ADMIN_EMAIL && !env.ADMIN_PHONE) return json({ ok: true, skipped: 'no_admin_contact' });

  let body;
  try { body = await request.json(); } catch { return err('JSON invalide', 400); }
  const { event, vars } = body || {};
  if (!ALLOWED.has(event)) return err('Événement admin non autorisé', 400);

  const rl = await rateLimit(env, `notifadmin:${clientIp(request)}`, 20, 60);
  if (!rl.allowed) return tooManyRequests(rl.resetAt);

  const r = await sendEventNotification(env, event, { email: env.ADMIN_EMAIL, phone: env.ADMIN_PHONE }, (vars && typeof vars === 'object') ? vars : {});
  return json({ ok: !!(r.email?.ok || r.email?.skipped || r.whatsapp?.ok || r.whatsapp?.skipped), result: r });
}
