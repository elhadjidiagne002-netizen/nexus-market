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

  // ── Cycle de vie d'une commande (acheteur) ──────────────────────────────────
  order_confirmed: { subject: '🛒 Commande confirmée — {{order_id}}',
    html: wrap('Commande confirmée', '<p>Bonjour {{buyer_name}},</p><p>Votre commande <strong>{{order_id}}</strong> est bien enregistrée. Nous vous tiendrons informé(e) de son avancement.</p>') },
  order_processing: { subject: '📦 Commande en préparation — {{order_id}}',
    html: wrap('Commande en préparation', '<p>Bonjour {{buyer_name}},</p><p>Votre commande <strong>{{order_id}}</strong> est en cours de préparation par le vendeur.</p>') },
  order_shipped: { subject: '🚚 Commande expédiée — {{order_id}}',
    html: wrap('Commande expédiée', '<p>Bonjour {{buyer_name}},</p><p>Bonne nouvelle ! Votre commande <strong>{{order_id}}</strong> a été expédiée.{{#if tracking_number}} Suivi : <strong>{{tracking_number}}</strong>.{{/if}}</p>') },
  order_in_transit: { subject: '🛵 Commande en cours de livraison — {{order_id}}',
    html: wrap('En cours de livraison', '<p>Bonjour {{buyer_name}},</p><p>Votre commande <strong>{{order_id}}</strong> est en route. Le livreur arrive bientôt.</p>') },
  order_delivered: { subject: '✅ Commande livrée — {{order_id}}',
    html: wrap('Commande livrée', '<p>Bonjour {{buyer_name}},</p><p>Votre commande <strong>{{order_id}}</strong> a été livrée. Merci de votre confiance ! N\'hésitez pas à laisser un avis.</p>') },
  order_cancelled: { subject: '❌ Commande annulée — {{order_id}}',
    html: wrap('Commande annulée', '<p>Bonjour {{buyer_name}},</p><p>Votre commande <strong>{{order_id}}</strong> a été annulée.{{#if reason}} Motif : {{reason}}.{{/if}} Un remboursement éventuel sera traité sous peu.</p>') },

  // ── Vendeur ─────────────────────────────────────────────────────────────────
  vendor_new_order: { subject: '🎉 Nouvelle commande reçue — {{order_id}}',
    html: wrap('Nouvelle commande !', '<p>Bonjour {{vendor_name}},</p><p>Vous avez reçu une nouvelle commande <strong>{{order_id}}</strong> d\'un montant de <strong>{{total}}</strong>. Préparez-la depuis votre tableau de bord vendeur.</p>') },
  vendor_approved: { subject: '✅ Votre boutique est validée — NEXUS Market',
    html: wrap('Bienvenue parmi les vendeurs NEXUS', '<p>Bonjour {{vendor_name}},</p><p>Félicitations ! Votre boutique <strong>{{shop_name}}</strong> est validée. Vous pouvez désormais publier vos produits et vendre sur NEXUS Market.</p>') },
  vendor_rejected: { subject: 'Votre dossier vendeur — NEXUS Market',
    html: wrap('Dossier examiné', '<p>Bonjour {{vendor_name}},</p><p>Après examen, nous ne pouvons pas valider votre inscription à ce stade.{{#if reason}} Motif : {{reason}}.{{/if}} Vous pourrez soumettre un nouveau dossier ultérieurement.</p>') },

  // ── Compte & relation client ────────────────────────────────────────────────
  welcome: { subject: '👋 Bienvenue sur NEXUS Market !',
    html: wrap('Bienvenue !', '<p>Bonjour {{name}},</p><p>Votre compte NEXUS Market est créé. Découvrez des milliers de produits, payez avec Orange Money / Wave, et faites-vous livrer partout au Sénégal.</p>') },
  new_message: { subject: '💬 Nouveau message sur NEXUS Market',
    html: wrap('Nouveau message', '<p>Bonjour {{name}},</p><p>Vous avez reçu un nouveau message{{#if from_name}} de <strong>{{from_name}}</strong>{{/if}}. Connectez-vous pour y répondre.</p>') },
  return_requested: { subject: '↩️ Demande de retour — Commande {{order_id}}',
    html: wrap('Demande de retour reçue', '<p>Bonjour {{buyer_name}},</p><p>Votre demande de retour pour la commande <strong>{{order_id}}</strong> a bien été enregistrée. Notre équipe la traite.</p>') },
  dispute_opened: { subject: '⚖️ Litige ouvert — Commande {{order_id}}',
    html: wrap('Litige ouvert', '<p>Bonjour,</p><p>Un litige a été ouvert pour la commande <strong>{{order_id}}</strong>. Notre équipe va l\'examiner et revenir vers les parties.</p>') },

  // ── Alertes stock / prix (déclenchées par stock-alerts.js) ──────────────────
  stock_back: { subject: '🔔 De nouveau en stock : {{product_name}}',
    html: wrap('De nouveau disponible', '<p>Bonjour {{buyer_name}},</p><p>Bonne nouvelle ! <strong>{{product_name}}</strong> est de nouveau en stock. Commandez vite avant rupture.{{#if product_url}}<br><br><a href="{{product_url}}" style="color:#00853E;font-weight:700">Voir le produit →</a>{{/if}}</p>') },
  price_drop: { subject: '📉 Baisse de prix : {{product_name}}',
    html: wrap('Le prix a baissé', '<p>Bonjour {{buyer_name}},</p><p>Le prix de <strong>{{product_name}}</strong> a baissé{{#if discount_pct}} de {{discount_pct}}%{{/if}} — désormais <strong>{{new_price}}</strong>.{{#if product_url}}<br><br><a href="{{product_url}}" style="color:#00853E;font-weight:700">En profiter →</a>{{/if}}</p>') },
};

/**
 * Envoi d'email serveur par clé d'événement : gating + template (DB ou défaut)
 * + substitution + envoi Resend + journalisation. Ne lève jamais.
 * vars._userId / vars._orderId alimentent le journal.
 */
export async function sendEventEmail(env, eventKey, to, vars = {}) {
  if (!to) return { skipped: 'no_recipient' };
  if (!env.RESEND_API_KEY && !env.BREVO_API_KEY) return { skipped: 'no_provider' };
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
