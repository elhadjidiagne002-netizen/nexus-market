// functions/api/_lib/notify.js
// Helpers du centre de notifications : gating par événement + journalisation
// dans email_logs / whatsapp_logs. Tolérant aux pannes (ne casse jamais l'envoi).
import { supabase, sendEmail } from './utils.js';
import { sendWhatsAppDirect } from './wa-send.js';
import { isValidPhone, normalizePhone } from './validate.js';

// Substitution {{clé}} (+ {{#if clé}}...{{/if}} basique) pour les templates serveur.
function applyVars(str, vars) {
  let s = String(str || '');
  s = s.replace(/\{\{#if\s+(\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g, (_, k, body) => (vars[k] ? body : ''));
  return s.replace(/\{\{(\w+)\}\}/g, (_, k) => (vars[k] != null ? String(vars[k]) : ''));
}

// Gabarit HTML de marque (utilisé si aucun template configuré n'est défini) :
// en-tête vert, carte de contenu, bouton CTA et pied de page. Le {{site_url}}
// est substitué par applyVars au moment de l'envoi.
function wrap(title, bodyHtml) {
  return `<div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;background:#ffffff">
  <div style="background:#00853E;padding:24px 20px;text-align:center">
    <h1 style="color:#ffffff;margin:0;font-size:22px;letter-spacing:.3px">NEXUS Market</h1>
  </div>
  <div style="padding:32px 24px;background:#f9fafb">
    <h2 style="color:#111827;margin:0 0 16px;font-size:18px">${title}</h2>
    <div style="background:#ffffff;border-radius:10px;padding:20px 22px;box-shadow:0 1px 3px rgba(0,0,0,.08);color:#374151;font-size:14px;line-height:1.6">${bodyHtml}</div>
    <div style="margin-top:28px;text-align:center">
      <a href="{{site_url}}" style="background:#00853E;color:#ffffff;padding:13px 32px;border-radius:8px;text-decoration:none;font-weight:700;font-size:14px;display:inline-block">Accéder à NEXUS Market</a>
    </div>
  </div>
  <div style="background:#1f2937;color:#9ca3af;padding:14px;text-align:center;font-size:12px">NEXUS Market — Dakar, Sénégal &nbsp;|&nbsp; nexusmarket.sn</div>
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
    html: wrap('Merci pour votre commande !', '<p>Bonjour <strong>{{buyer_name}}</strong>,</p><p>Votre commande <strong>#{{order_id}}</strong> est bien enregistrée. Nous vous tiendrons informé(e) de son avancement.</p>{{#if total}}<p style="margin:16px 0 4px"><strong>Montant :</strong> {{total}}</p>{{/if}}{{#if items}}<p style="margin:16px 0 6px"><strong>Articles :</strong></p>{{items}}{{/if}}{{#if address}}<p style="margin:16px 0 4px"><strong>Livraison :</strong> {{address}}</p>{{/if}}{{#if order_date}}<p style="margin:12px 0 0;color:#6b7280;font-size:13px">Commande passée le {{order_date}}.</p>{{/if}}') },
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
  // ── Stories à la vente / offres (acheteur invité inclus) ────────────────────
  new_offer: { subject: '💰 {{kind_label}} sur {{story_title}} — NEXUS',
    html: wrap('{{kind_label}} reçue', '<p>Bonjour,</p><p>Vous avez reçu une <strong>{{kind_label}}</strong> sur « {{story_title}} ».</p><p style="margin:16px 0 4px"><strong>Client :</strong> {{buyer_name}}</p><p style="margin:4px 0"><strong>Téléphone :</strong> {{buyer_phone}}</p>{{#if buyer_email}}<p style="margin:4px 0"><strong>Email :</strong> {{buyer_email}}</p>{{/if}}{{#if amount}}<p style="margin:4px 0"><strong>Montant proposé :</strong> {{amount}}</p>{{/if}}{{#if message}}<p style="margin:12px 0 4px"><strong>Message :</strong> {{message}}</p>{{/if}}<p style="margin-top:14px;color:#6b7280;font-size:13px">Contactez le client pour conclure la vente.</p>') },
  offer_submitted: { subject: '✅ Votre {{kind_label}} est transmise — NEXUS Market',
    html: wrap('Bien reçu !', '<p>Bonjour {{buyer_name}},</p><p>Votre {{kind_label}} sur « {{story_title}} » a bien été transmise au vendeur{{#if amount}} pour <strong>{{amount}}</strong>{{/if}}. Il vous contactera directement.</p><p style="margin-top:12px;color:#6b7280;font-size:13px">Référence : {{offer_id}}.</p>') },

  vendor_approved: { subject: '✅ Votre boutique est validée — NEXUS Market',
    html: wrap('Bienvenue parmi les vendeurs NEXUS', '<p>Bonjour {{vendor_name}},</p><p>Félicitations ! Votre boutique <strong>{{shop_name}}</strong> est validée. Vous pouvez désormais publier vos produits et vendre sur NEXUS Market.</p>') },
  vendor_rejected: { subject: 'Votre dossier vendeur — NEXUS Market',
    html: wrap('Dossier examiné', '<p>Bonjour {{vendor_name}},</p><p>Après examen, nous ne pouvons pas valider votre inscription à ce stade.{{#if reason}} Motif : {{reason}}.{{/if}} Vous pourrez soumettre un nouveau dossier ultérieurement.</p>') },
  low_stock: { subject: '📉 Stock faible : {{product_name}} ({{stock}} restant)',
    html: wrap('Stock faible', '<p>Bonjour {{vendor_name}},</p><p>Votre produit <strong>{{product_name}}</strong> n\'a plus que <strong>{{stock}}</strong> unité(s) en stock. Pensez à le réapprovisionner pour ne pas manquer de ventes.</p>') },
  product_moderated: { subject: 'Modération de votre produit {{product_name}} — NEXUS',
    html: wrap('Produit modéré', '<p>Bonjour {{vendor_name}},</p><p>Votre produit <strong>{{product_name}}</strong> a été modéré et n\'est plus visible.{{#if reason}} Motif : {{reason}}.{{/if}}</p><p style="margin-top:14px;color:#6b7280;font-size:13px">Corrigez-le depuis votre tableau de bord pour le soumettre à nouveau.</p>') },

  // ── Devis B2B ───────────────────────────────────────────────────────────────
  quote_request: { subject: '📨 Nouvelle demande de devis de {{buyer_name}} — NEXUS',
    html: wrap('Nouvelle demande de devis', '<p>Bonjour {{vendor_name}},</p><p><strong>{{buyer_name}}</strong> vous demande un devis.</p>{{#if request_text}}<p style="margin:14px 0 4px"><strong>Demande :</strong></p><p>{{request_text}}</p>{{/if}}<p style="margin-top:14px;color:#6b7280;font-size:13px">Répondez depuis votre tableau de bord vendeur.</p>') },
  quote_sent: { subject: '📄 Votre devis NEXUS Market',
    html: wrap('Votre devis', '<p>Bonjour {{buyer_name}},</p><p>Le vendeur vous a transmis un devis{{#if total}} d\'un montant de <strong>{{total}}</strong>{{/if}}.{{#if quote_id}} Référence : {{quote_id}}.{{/if}}</p>{{#if message}}<p style="margin-top:12px">{{message}}</p>{{/if}}') },

  // ── Admin ───────────────────────────────────────────────────────────────────
  admin_new_vendor: { subject: '🆕 Nouveau vendeur : {{vendor_name}}',
    html: wrap('Nouveau vendeur inscrit', '<p>Un nouveau vendeur vient de s\'inscrire et attend validation.</p><p style="margin:14px 0 4px"><strong>Nom :</strong> {{vendor_name}}</p>{{#if vendor_email}}<p style="margin:4px 0"><strong>Email :</strong> {{vendor_email}}</p>{{/if}}<p style="margin-top:14px;color:#6b7280;font-size:13px">Validez-le depuis l\'admin → Vendeurs.</p>') },
  admin_new_dispute: { subject: '⚖️ Nouveau litige #{{dispute_id}}',
    html: wrap('Nouveau litige ouvert', '<p>Un litige vient d\'être ouvert.</p><p style="margin:14px 0 4px"><strong>Litige :</strong> #{{dispute_id}}</p>{{#if order_id}}<p style="margin:4px 0"><strong>Commande :</strong> {{order_id}}</p>{{/if}}{{#if buyer_name}}<p style="margin:4px 0"><strong>Acheteur :</strong> {{buyer_name}}</p>{{/if}}<p style="margin-top:14px;color:#6b7280;font-size:13px">Traitez-le depuis l\'admin → Litiges.</p>') },

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

// Gabarits texte WhatsApp (courts, sans HTML) par clé d'événement — même
// couverture que DEFAULTS (email) pour généraliser : partout où un email
// serveur est envoyé, un message WhatsApp équivalent part aussi (si un
// téléphone est disponible et qu'un fournisseur WhatsApp est configuré).
const WA_DEFAULTS = {
  payment_received: '✅ NEXUS Market — Paiement reçu pour la commande #{{order_id}} ({{total}} FCFA). Merci {{buyer_name}} !',
  refund_processed: '💸 NEXUS Market — Remboursement de {{amount}} FCFA effectué pour la commande #{{order_id}}.',
  payout_processed: '💰 NEXUS Market — Virement de {{amount_fcfa}} FCFA effectué. Merci {{vendor_name}} !',
  payout_failed: '⚠️ NEXUS Market — Échec du virement de {{amount_fcfa}} FCFA ({{reason}}). Notre équipe revient vers vous.',
  payout_requested: '⏳ NEXUS Market — Demande de virement de {{amount_fcfa}} FCFA bien reçue, en cours de traitement.',
  admin_payout_request: '💸 NEXUS Admin — {{vendor_name}} demande un retrait de {{amount_fcfa}} FCFA via {{method}}.',

  order_confirmed: '🛒 NEXUS Market — Commande #{{order_id}} confirmée. Merci {{buyer_name}} !{{#if total}} Montant : {{total}}.{{/if}}',
  order_processing: '📦 NEXUS Market — Commande #{{order_id}} en cours de préparation.',
  order_shipped: '🚚 NEXUS Market — Commande #{{order_id}} expédiée !{{#if tracking_number}} Suivi : {{tracking_number}}.{{/if}}',
  order_in_transit: '🛵 NEXUS Market — Commande #{{order_id}} en route. Le livreur arrive bientôt.',
  order_delivered: '✅ NEXUS Market — Commande #{{order_id}} livrée. Merci de votre confiance !',
  order_cancelled: '❌ NEXUS Market — Commande #{{order_id}} annulée.{{#if reason}} Motif : {{reason}}.{{/if}}',

  vendor_new_order: '🎉 NEXUS Market — Nouvelle commande #{{order_id}} reçue{{#if total}} ({{total}}){{/if}}. Préparez l\'expédition.',
  new_offer: '💰 NEXUS Market — {{kind_label}} reçue sur « {{story_title}} » de {{buyer_name}}{{#if buyer_phone}} ({{buyer_phone}}){{/if}}.{{#if amount}} Montant : {{amount}}.{{/if}}',
  offer_submitted: '✅ NEXUS Market — Votre {{kind_label}} sur « {{story_title}} » a été transmise{{#if amount}} pour {{amount}}{{/if}}. Le vendeur vous contactera.',

  vendor_approved: '✅ NEXUS Market — Votre boutique {{shop_name}} est validée. Vous pouvez vendre dès maintenant !',
  vendor_rejected: 'NEXUS Market — Votre dossier vendeur n\'a pas été validé.{{#if reason}} Motif : {{reason}}.{{/if}}',
  low_stock: '📉 NEXUS Market — Stock faible : {{product_name}} ({{stock}} restant). Pensez à réapprovisionner.',
  product_moderated: 'NEXUS Market — Votre produit {{product_name}} a été modéré et n\'est plus visible.{{#if reason}} Motif : {{reason}}.{{/if}}',

  quote_request: '📨 NEXUS Market — {{buyer_name}} vous demande un devis. Répondez depuis votre tableau de bord.',
  quote_sent: '📄 NEXUS Market — Le vendeur vous a transmis un devis{{#if total}} de {{total}}{{/if}}.',

  admin_new_vendor: '🆕 NEXUS Admin — Nouveau vendeur inscrit : {{vendor_name}}. Validez-le depuis l\'admin.',
  admin_new_dispute: '⚖️ NEXUS Admin — Nouveau litige #{{dispute_id}} ouvert.{{#if order_id}} Commande : {{order_id}}.{{/if}}',

  welcome: '👋 Bienvenue sur NEXUS Market, {{name}} ! Découvrez des milliers de produits, payez en toute sécurité et faites-vous livrer partout au Sénégal.',
  new_message: '💬 NEXUS Market — Nouveau message{{#if from_name}} de {{from_name}}{{/if}}. Connectez-vous pour y répondre.',
  return_requested: '↩️ NEXUS Market — Votre demande de retour pour la commande #{{order_id}} est bien enregistrée.',
  dispute_opened: '⚖️ NEXUS Market — Un litige a été ouvert pour la commande #{{order_id}}. Notre équipe l\'examine.',

  stock_back: '🔔 NEXUS Market — {{product_name}} est de nouveau en stock ! Commandez vite avant rupture.',
  price_drop: '📉 NEXUS Market — Le prix de {{product_name}} a baissé{{#if discount_pct}} de {{discount_pct}}%{{/if}} : désormais {{new_price}}.',
};

// Mapping clé d'événement serveur → identifiant de template de l'éditeur admin
// (app_config.nexus_email_templates). La plupart sont identiques ; seul
// order_confirmed diffère (l'éditeur l'appelle order_confirmation).
const ADMIN_TPL_ALIAS = { order_confirmed: 'order_confirmation' };

/**
 * Template configuré par l'admin dans l'éditeur (Admin → Templates email),
 * stocké dans app_config.nexus_email_templates = { [templateId]: {subject, htmlBody|html} }.
 * Renvoie { subject, html } ou null. Lit les deux conventions de clé (htmlBody/html).
 */
async function getAdminTemplate(env, eventKey) {
  try {
    const sb = supabase(env);
    const rows = await sb.from('app_config').select('value', `key=eq.nexus_email_templates`);
    const cfg = Array.isArray(rows) && rows[0] && rows[0].value;
    if (!cfg || typeof cfg !== 'object') return null;
    const id = ADMIN_TPL_ALIAS[eventKey] || eventKey;
    const t = cfg[id];
    if (!t) return null;
    const html = t.htmlBody || t.html || '';
    const subject = t.subject || '';
    if (!html && !subject) return null;
    return { subject, html };
  } catch (_) { return null; }
}

/**
 * Envoi d'email serveur par clé d'événement : gating + template + substitution
 * + envoi Resend + journalisation. Ne lève jamais. Résolution du template :
 *   1) table email_templates (name=eventKey)  2) éditeur admin (app_config)
 *   3) gabarit de marque intégré (DEFAULTS).
 * vars._userId / vars._orderId alimentent le journal.
 */
export async function sendEventEmail(env, eventKey, to, vars = {}) {
  if (!to) return { skipped: 'no_recipient' };
  if (!env.RESEND_API_KEY && !env.BREVO_API_KEY) return { skipped: 'no_provider' };
  const cfg = await getEventConfig(env, eventKey);
  if (cfg && cfg.email_enabled === false) return { skipped: 'disabled' };

  let subject = '', html = '';
  // 1) Template serveur dédié (table email_templates).
  try {
    const sb = supabase(env);
    const rows = await sb.from('email_templates').select('subject,html_body', `name=eq.${encodeURIComponent(eventKey)}`);
    const t = Array.isArray(rows) && rows[0];
    if (t) { subject = t.subject || ''; html = t.html_body || ''; }
  } catch (_) {}
  // 2) Template configuré dans l'éditeur admin (app_config.nexus_email_templates).
  if (!subject || !html) {
    const at = await getAdminTemplate(env, eventKey);
    if (at) { subject = subject || at.subject; html = html || at.html; }
  }
  // 3) Gabarit de marque intégré.
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
 * Envoi d'un message WhatsApp serveur par clé d'événement : gating + gabarit
 * texte (WA_DEFAULTS) + substitution + envoi (Green API / repli WAHA) +
 * journalisation whatsapp_logs. Ne lève jamais. Généralise à tous les
 * événements pour lesquels un email serveur est envoyé (cf. sendEventEmail) :
 * dès qu'un téléphone est disponible, le message WhatsApp part en parallèle.
 */
export async function sendEventWhatsApp(env, eventKey, phone, vars = {}) {
  if (!isValidPhone(phone)) return { skipped: 'no_recipient' };
  const greenConfigured = !!(env.GREEN_API_INSTANCE_ID && env.GREEN_API_TOKEN);
  const wahaConfigured  = !!(env.WAHA_BASE_URL && env.WAHA_API_KEY);
  if (!greenConfigured && !wahaConfigured) return { skipped: 'no_provider' };

  const cfg = await getEventConfig(env, eventKey);
  if (cfg && cfg.whatsapp_enabled === false) return { skipped: 'disabled' };

  const tpl = WA_DEFAULTS[eventKey];
  if (!tpl) return { skipped: 'no_template' };
  const message = applyVars(tpl, vars).trim();
  if (!message) return { skipped: 'empty_message' };

  const logRow = { phone: normalizePhone(phone), message, template: eventKey, user_id: vars._userId || null };
  try {
    const r = await sendWhatsAppDirect(env, { phone, message });
    if (r && r.ok) {
      await logWhatsApp(env, { ...logRow, status: 'sent', green_id: r.id || null, context: { provider: r.provider } });
      return { ok: true, provider: r.provider };
    }
    await logWhatsApp(env, { ...logRow, status: 'failed', error_msg: r && r.error, context: { provider_attempted: r && r.provider } });
    return { ok: false, error: r && r.error };
  } catch (e) {
    await logWhatsApp(env, { ...logRow, status: 'failed', error_msg: e.message });
    return { ok: false, error: e.message };
  }
}

/** Résout le téléphone d'un utilisateur (profiles.phone) à partir de son UUID. */
export async function resolvePhone(env, userId) {
  if (!userId) return null;
  try {
    const sb = supabase(env);
    const rows = await sb.from('profiles').select('phone', `id=eq.${encodeURIComponent(userId)}`);
    const p = Array.isArray(rows) && rows[0];
    return (p && p.phone) || null;
  } catch (_) { return null; }
}

/**
 * Envoi combiné email + WhatsApp pour un même événement (mêmes vars, mêmes
 * templates de contenu adaptés au canal). `recipient` = { email?, phone?,
 * userId? } — si `phone` est absent mais `userId` fourni, le téléphone est
 * résolu via profiles. Chaque canal est best-effort et indépendant de l'autre.
 */
export async function sendEventNotification(env, eventKey, recipient = {}, vars = {}) {
  const { email, phone, userId } = recipient;
  const waPhone = phone || (userId ? await resolvePhone(env, userId) : null);
  const [emailResult, whatsappResult] = await Promise.all([
    email ? sendEventEmail(env, eventKey, email, vars) : Promise.resolve({ skipped: 'no_recipient' }),
    waPhone ? sendEventWhatsApp(env, eventKey, waPhone, vars) : Promise.resolve({ skipped: 'no_recipient' }),
  ]);

  // [OUTBOX] Retry différé : si un canal a RÉELLEMENT échoué (ok=false, ≠ skipped),
  // on l'enfile pour un nouvel essai par /cron/notify-retry. On ne rejoue que le
  // canal en échec (statut par canal) → jamais de doublon sur le canal déjà passé.
  try {
    const emailStatus = channelOutboxStatus(!!email, emailResult);
    const waStatus = channelOutboxStatus(!!waPhone, whatsappResult);
    if (emailStatus === 'pending' || waStatus === 'pending') {
      const errParts = [emailStatus === 'pending' && `email:${emailResult && emailResult.error}`,
                        waStatus === 'pending' && `wa:${whatsappResult && whatsappResult.error}`].filter(Boolean);
      await enqueueOutbox(env, {
        event_key: eventKey,
        recipient: { email: email || null, phone: waPhone || null, userId: userId || null },
        vars: vars && typeof vars === 'object' ? vars : {},
        email_status: emailStatus,
        whatsapp_status: waStatus,
        last_error: errParts.join(' | ').slice(0, 500) || null,
        next_retry_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
      });
    }
  } catch (e) { console.warn('[notify] enqueueOutbox:', e.message); }

  return { email: emailResult, whatsapp: whatsappResult };
}

/**
 * Traduit le résultat d'un canal en statut outbox :
 *   'sent'    → envoyé (ok)
 *   'skipped' → pas de destinataire / désactivé / pas de provider / pas de template
 *   'pending' → échec RÉEL (ok=false) → à rejouer
 */
export function channelOutboxStatus(hasRecipient, result) {
  if (!hasRecipient || !result) return 'skipped';
  if (result.ok) return 'sent';
  if (result.skipped) return 'skipped';
  return 'pending';
}

/** Insère une ligne dans notification_outbox (best-effort ; ne lève jamais). */
export async function enqueueOutbox(env, row) {
  try {
    const sb = supabase(env);
    await sb.from('notification_outbox').insert(row);
  } catch (e) {
    console.warn('[notify] enqueueOutbox insert:', e.message);
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
