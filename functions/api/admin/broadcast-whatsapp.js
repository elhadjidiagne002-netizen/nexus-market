// functions/api/admin/broadcast-whatsapp.js
// POST /api/admin/broadcast-whatsapp — envoi WhatsApp en masse aux inscrits.
//
// Pendant WhatsApp de /api/admin/broadcast (campagne email). Réservé aux ADMINS
// (requireAdmin). Lit les téléphones depuis `profiles` (filtre par audience/rôle,
// phone NON NULL), dédoublonne + valide (E.164 Sénégal), puis envoie un message
// individuel via sendWhatsAppDirect (Green API → repli WAHA, cf. wa-send.js).
// Chaque envoi est journalisé dans `whatsapp_logs` (comme l'endpoint HTTP).
//
// Mode `test` = envoie uniquement au téléphone de l'admin (résolu via profiles).
//
// ⚠️ Limite de sous-requêtes Cloudflare Pages Functions : chaque message = 1 fetch.
// On plafonne donc le volume par envoi (BROADCAST_WA_MAX, défaut 200) ; au-delà,
// relancer la campagne (les envois sont séquentiels pour ménager le fournisseur).
import { options, json, err, requireAdmin, supabase, CORS } from '../_lib/utils.js';
import { rateLimit, clientIp, tooManyRequests } from '../_lib/ratelimit.js';
import { sendWhatsAppDirect } from '../_lib/wa-send.js';
import { logWhatsApp } from '../_lib/notify.js';
import { isValidPhone, normalizePhone } from '../_lib/validate.js';

// 'newsletter' est volontairement absent : la table newsletter_subscribers ne
// collecte QUE l'email (pas de téléphone) → aucune campagne WhatsApp possible.
const ROLES = ['buyer', 'buyer_pro', 'vendor', 'pro', 'breeder', 'courier'];
const AUDIENCES = [...ROLES];

// Compose le texte final : message + éventuel lien en dernière ligne.
function buildMessage({ message, link }) {
  let txt = String(message || '').trim();
  if (link) txt += `\n\n${link}`;
  return txt;
}

export async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') return options();
  if (request.method !== 'POST') return err('POST requis', 405);

  // ── Admin uniquement ──────────────────────────────────────────────────────
  const [admin, authErr] = await requireAdmin(request, env);
  if (authErr) return authErr;

  // ── Au moins un fournisseur WhatsApp configuré ────────────────────────────
  const greenConfigured = !!(env.GREEN_API_INSTANCE_ID && env.GREEN_API_TOKEN);
  const wahaConfigured = !!(env.WAHA_BASE_URL && env.WAHA_API_KEY);
  if (!greenConfigured && !wahaConfigured) {
    return err('Aucun fournisseur WhatsApp configuré (Green API ni WAHA)', 503);
  }

  // ── Anti-abus : 3 envois / 10 min (plus strict que l'email, quota fournisseur) ─
  const rl = await rateLimit(env, `broadcast-wa:${admin.id || clientIp(request)}`, 3, 600);
  if (!rl.allowed) return tooManyRequests(rl.resetAt, CORS);

  let body;
  try { body = await request.json(); } catch { return err('JSON invalide', 400); }
  const { message, link, audience = 'all', test } = body || {};

  if (typeof message !== 'string' || message.trim().length < 2 || message.length > 4000)
    return err('Message invalide (2 à 4000 caractères)', 400);
  if (link && !/^https?:\/\//.test(link)) return err('Lien invalide (doit commencer par http/https)', 400);
  if (audience !== 'all' && !AUDIENCES.includes(audience)) return err('Audience invalide', 400);

  const text = buildMessage({ message, link });
  const sb = supabase(env);

  // ── Mode test : envoi au seul téléphone de l'admin (résolu via profiles) ──
  if (test) {
    let adminPhone = null;
    try {
      const rows = await sb.from('profiles').select('phone', `email=eq.${encodeURIComponent(admin.email)}`);
      adminPhone = rows && rows[0] && rows[0].phone;
    } catch (_) {}
    if (!adminPhone || !isValidPhone(adminPhone))
      return err('Aucun numéro de téléphone valide sur votre profil admin (renseignez-le pour tester)', 400);
    const r = await sendWhatsAppDirect(env, { phone: adminPhone, message: `[TEST] ${text}` });
    await logWhatsApp(env, {
      phone: normalizePhone(adminPhone), message: `[TEST] ${text}`, template: 'broadcast_wa_test',
      user_id: admin.id || null, status: r.ok ? 'sent' : 'failed',
      green_id: r.id || null, error_msg: r.ok ? null : r.error,
      context: { provider: r.provider, test: true },
    });
    return json({ ok: !!r.ok, test: true, to: normalizePhone(adminPhone), error: r.ok ? undefined : r.error });
  }

  // ── Récupérer les destinataires : profiles (par rôle) avec téléphone ──────
  const max = Math.max(1, Math.min(1000, parseInt(env.BROADCAST_WA_MAX || '200', 10)));
  let rows;
  try {
    let filter = 'phone=not.is.null';
    if (audience !== 'all') filter += `&role=eq.${audience}`;
    rows = await sb.from('profiles').select('phone', `${filter}&order=created_at.asc&limit=${max}`);
  } catch (e) {
    return err('Lecture des inscrits impossible : ' + e.message, 502);
  }

  // Dédoublonnage (par numéro normalisé) + validation E.164.
  const seen = new Set();
  const recipients = [];
  for (const r of (rows || [])) {
    const raw = (r.phone || '').trim();
    if (!raw || !isValidPhone(raw)) continue;
    const norm = normalizePhone(raw);
    if (seen.has(norm)) continue;
    seen.add(norm);
    recipients.push({ raw, norm });
  }
  if (!recipients.length) return json({ ok: true, total: 0, sent: 0, failed: 0, note: 'Aucun destinataire avec téléphone valide' });

  // ── Envoi séquentiel (ménage le fournisseur : Green API a un quota strict) ─
  let sent = 0, failed = 0;
  for (const rc of recipients) {
    const r = await sendWhatsAppDirect(env, { phone: rc.raw, message: text }).catch(() => null);
    const okSend = !!(r && r.ok);
    if (okSend) sent++; else failed++;
    await logWhatsApp(env, {
      phone: rc.norm, message: text, template: 'broadcast_wa',
      user_id: null, status: okSend ? 'sent' : 'failed',
      green_id: (r && r.id) || null, error_msg: okSend ? null : (r && r.error) || 'échec',
      context: { provider: r && r.provider, campaign: true },
    });
  }

  const note = recipients.length >= max
    ? `Plafond de ${max} destinataires atteint — relancez pour envoyer aux suivants (BROADCAST_WA_MAX).`
    : undefined;
  return json({ ok: true, total: recipients.length, sent, failed, note });
}
