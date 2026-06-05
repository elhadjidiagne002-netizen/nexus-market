// functions/api/_lib/notify.js
// Helpers du centre de notifications : gating par événement + journalisation
// dans email_logs / whatsapp_logs. Tolérant aux pannes (ne casse jamais l'envoi).
import { supabase, sendEmail } from './utils.js';

// Substitution {{clé}} (+ {{#if clé}}...{{/if}} basique) pour les templates serveur.
function applyVars(str, vars) {
  let s = String(str || '');
  s = s.replace(/\{\{#if\s+(\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g, (_, k, body) => (vars[k] ? body : ''));
  return s.replace(/\{\{(\w+)\}\}/g, (_, k) => (vars[k] != null ? String(vars[k]) : ''));
}

// Gabarit HTML minimal et neutre (utilisé si aucun template DB n'est défini).
function wrap(title, bodyHtml) {
  return `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#fff">
  <div style="background:#00853E;padding:20px;text-align:center"><h1 style="color:#fff;margin:0;font-size:20px">NEXUS Market</h1></div>
  <div style="padding:28px 24px;background:#f9fafb"><h2 style="color:#111827;margin:0 0 12px;font-size:18px">${title}</h2>${bodyHtml}</div>
  <div style="background:#1f2937;color:#9ca3af;padding:12px;text-align:center;font-size:12px">NEXUS Market — Dakar, Sénégal</div>
</div>`;
}

// Défauts intégrés pour les événements déclenchés côté backend (si pas de template DB).
const DEFAULTS = {
  payment_received: { subject: '✅ Paiement reçu — Commande {{order_id}}',
    html: wrap('Paiement confirmé', '<p>Bonjour {{buyer_name}},</p><p>Nous avons bien reçu votre paiement de <strong>{{total}} FCFA</strong> pour la commande <strong>{{order_id}}</strong>. Elle est en cours de traitement.</p>') },
  refund_processed: { subject: '💸 Remboursement effectué — Commande {{order_id}}',
    html: wrap('Remboursement effectué', '<p>Bonjour {{buyer_name}},</p><p>Un remboursement de <strong>{{amount}} FCFA</strong> a été effectué pour la commande <strong>{{order_id}}</strong>.</p>') },
  payout_processed: { subject: '💰 Virement de {{amount_fcfa}} FCFA effectué',
    html: wrap('Virement effectué', '<p>Bonjour {{vendor_name}},</p><p>Votre virement de <strong>{{amount_fcfa}} FCFA</strong> a été effectué avec succès.</p>') },
  payout_failed: { subject: '⚠️ Échec du virement — {{amount_fcfa}} FCFA',
    html: wrap('Échec du virement', '<p>Bonjour {{vendor_name}},</p><p>Votre virement de <strong>{{amount_fcfa}} FCFA</strong> n\'a pas pu être effectué ({{reason}}). Notre équipe revient vers vous.</p>') },
  payout_requested: { subject: '⏳ Demande de virement reçue — {{amount_fcfa}} FCFA',
    html: wrap('Demande de virement reçue', '<p>Bonjour {{vendor_name}},</p><p>Nous avons bien reçu votre demande de virement de <strong>{{amount_fcfa}} FCFA</strong>. Elle est en cours de traitement.</p>') },
  admin_payout_request: { subject: '💸 Demande de retrait : {{amount_fcfa}} FCFA — {{vendor_name}}',
    html: wrap('Nouvelle demande de retrait', '<p>Le vendeur <strong>{{vendor_name}}</strong> demande un retrait de <strong>{{amount_fcfa}} FCFA</strong> via {{method}}.</p>') },
};

/**
 * Envoi d'email serveur par clé d'événement : gating + template (DB ou défaut)
 * + substitution + envoi Resend + journalisation. Ne lève jamais.
 * vars._userId / vars._orderId alimentent le journal.
 */
export async function sendEventEmail(env, eventKey, to, vars = {}) {
  if (!to) return { skipped: 'no_recipient' };
  if (!env.RESEND_API_KEY) return { skipped: 'no_resend' };
  const cfg = await getEventConfig(env, eventKey);
  if (cfg && cfg.email_enabled === false) return { skipped: 'disabled' };

  let subject = '', html = '';
  try {
    const sb = supabase(env);
    const rows = await sb.from('email_templates').select('subject,html_body', `name=eq.${encodeURIComponent(eventKey)}`);
    const t = Array.isArray(rows) && rows[0];
    if (t) { subject = t.subject || ''; html = t.html_body || ''; }
  } catch (_) {}
  if (!subject || !html) {
    const d = DEFAULTS[eventKey] || { subject: 'NEXUS Market', html: wrap('Notification', '<p>{{message}}</p>') };
    subject = subject || d.subject;
    html = html || d.html;
  }
  const fullVars = { site_url: env.SITE_URL || env.FRONTEND_URL || '', ...vars };
  subject = applyVars(subject, fullVars);
  html = applyVars(html, fullVars);

  const logBase = { to_email: to, subject, template: eventKey, user_id: vars._userId || null, order_id: vars._orderId || null };
  try {
    const r = await sendEmail(env, { to, subject, html });
    if (r && r.ok) {
      const d = await r.json().catch(() => ({}));
      await logEmail(env, { ...logBase, status: 'sent', provider_id: d?.id || null });
      return { ok: true };
    }
    await logEmail(env, { ...logBase, status: 'failed' });
    return { ok: false };
  } catch (e) {
    await logEmail(env, { ...logBase, status: 'failed' });
    return { ok: false, error: e.message };
  }
}

/**
 * Config d'un événement : { email_enabled, whatsapp_enabled } ou null si inconnu
 * (événement non catalogué → on n'applique aucun gating, l'envoi a lieu).
 */
export async function getEventConfig(env, eventKey) {
  if (!eventKey) return null;
  try {
    const sb = supabase(env);
    const rows = await sb
      .from('notification_events')
      .select('email_enabled,whatsapp_enabled', `event_key=eq.${encodeURIComponent(eventKey)}`);
    return Array.isArray(rows) && rows[0] ? rows[0] : null;
  } catch (e) {
    console.warn('[notify] getEventConfig:', e.message);
    return null;
  }
}

/** Journalise un email (best-effort). */
export async function logEmail(env, row) {
  try {
    const sb = supabase(env);
    await sb.from('email_logs').insert(row);
  } catch (e) {
    console.warn('[notify] logEmail:', e.message);
  }
}

/** Journalise un message WhatsApp (best-effort). */
export async function logWhatsApp(env, row) {
  try {
    const sb = supabase(env);
    await sb.from('whatsapp_logs').insert(row);
  } catch (e) {
    console.warn('[notify] logWhatsApp:', e.message);
  }
}
