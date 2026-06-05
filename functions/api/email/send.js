// functions/api/email/send.js
// POST /api/email/send — envoi d'email côté SERVEUR via Resend.
// Évite l'envoi client-side (Brevo) qui échoue sur restriction d'IP et expose
// la clé API. Auth Supabase requise + rate limit (anti-spam).
import { options, json, err, requireAuth, sendEmail, CORS } from '../_lib/utils.js';
import { rateLimit, clientIp, tooManyRequests } from '../_lib/ratelimit.js';
import { getEventConfig, logEmail } from '../_lib/notify.js';

export async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') return options();
  if (request.method !== 'POST') return err('POST requis', 405);

  // Auth OPTIONNELLE : connecté → quota large ; invité (checkout guest) → quota
  // strict. Un token invalide ne bloque pas (on retombe sur le quota invité).
  let authed = false;
  if (request.headers.get('Authorization')) {
    const [user, authError] = await requireAuth(request, env);
    if (!authError && user?.id) authed = true;
  }

  if (!env.RESEND_API_KEY) return err('Service email non configuré (RESEND_API_KEY)', 503);

  let body;
  try { body = await request.json(); } catch { return err('JSON invalide', 400); }
  // event/userId/orderId : métadonnées du centre de notifications (gating + log).
  const { to, subject, html, event, userId, orderId } = body || {};

  // ── Validation ──────────────────────────────────────────────────────────
  if (typeof to !== 'string' || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to))
    return err('Email destinataire invalide', 400);
  if (typeof subject !== 'string' || subject.length === 0 || subject.length > 300)
    return err('Sujet invalide (1–300 caractères)', 400);
  if (typeof html !== 'string' || html.length === 0 || html.length > 100000)
    return err('Contenu HTML invalide', 400);

  // ── Gating par événement (centre de notifications) ──────────────────────
  // Si un `event` est fourni et désactivé pour l'email par l'admin → on n'envoie
  // pas (et on ne journalise pas un "envoi" fantôme).
  if (event) {
    const cfg = await getEventConfig(env, event);
    if (cfg && cfg.email_enabled === false) {
      return json({ ok: true, skipped: 'event_disabled' });
    }
  }

  // ── Rate limiting (buckets séparés) : connecté 20/min, invité 5/min / IP ──
  const max = authed ? 20 : 5;
  const bucket = authed ? 'auth' : 'guest';
  const rl = await rateLimit(env, `email:${bucket}:${clientIp(request)}`, max, 60);
  if (!rl.allowed) return tooManyRequests(rl.resetAt, CORS);

  const logBase = { to_email: to, subject, template: event || null,
    user_id: userId || null, order_id: orderId || null };
  try {
    const r = await sendEmail(env, { to, subject, html });
    if (r && r.ok) {
      const data = await r.json().catch(() => ({}));
      await logEmail(env, { ...logBase, status: 'sent', provider_id: data?.id || null });
      return json({ ok: true });
    }
    const detail = r ? await r.text().catch(() => '') : 'no-response';
    console.error('[email/send] Resend KO:', detail);
    await logEmail(env, { ...logBase, status: 'failed' });
    return json({ ok: false, error: 'Échec envoi email' }, 502);
  } catch (e) {
    console.error('[email/send]', e.message);
    await logEmail(env, { ...logBase, status: 'failed' });
    return err(e.message, 500);
  }
}
