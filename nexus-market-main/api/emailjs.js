// ═══════════════════════════════════════════════════════════════════════════
// GasTon 360 — emailjs.js  (helper email via EmailJS SDK v4)
// À placer dans : src/lib/emailjs.js  ou  src/utils/emailjs.js
//
// FIX : Migration SDK v2/v3 → v4
// L'ancienne API emailjs.sendForm() et emailjs.send() avec (serviceId, templateId, params, userId)
// est remplacée par emailjs.send(serviceId, templateId, params) — la clé publique
// est maintenant initialisée une seule fois via emailjs.init().
// ═══════════════════════════════════════════════════════════════════════════

// ── Configuration ─────────────────────────────────────────────────────────
const EMAILJS_CONFIG = {
  serviceId:       'service_84yfkgf',
  publicKey:       'WSBntSTWdh5d9usZC',
  privateKey:      'MYTRFE7rqZ2rC7IZcRTuf',   // Utilisé uniquement côté serveur
  templates: {
    order:         'template_t075pts',           // Email confirmation commande
    resetPassword: 'template_rmydvxg',           // Email reset mot de passe
  },
};

// ── Initialisation (à appeler une seule fois au démarrage) ────────────────
export function initEmailJS() {
  if (typeof window === 'undefined') return; // SSR : ne pas initialiser côté serveur
  if (!window.emailjs) {
    console.warn('[EmailJS] SDK non chargé — ajoutez le script dans index.html');
    return;
  }
  // API v4 : init prend un objet
  window.emailjs.init({ publicKey: EMAILJS_CONFIG.publicKey });
  console.log('[EmailJS] Initialisé ✅');
}

// ── Envoyer une confirmation de commande ──────────────────────────────────
export async function sendOrderConfirmation({ buyerName, buyerEmail, orderId, amount, items }) {
  if (!window.emailjs) throw new Error('EmailJS SDK non chargé');

  const templateParams = {
    to_name:    buyerName,
    to_email:   buyerEmail,
    order_id:   orderId?.slice(0, 8).toUpperCase() || 'XXXXXX',
    amount:     amount ? `${parseFloat(amount).toLocaleString('fr-FR')} FCFA` : '—',
    items:      Array.isArray(items) ? items.map(i => i.name).join(', ') : '—',
    market_url: process.env.NEXT_PUBLIC_APP_URL || 'https://nexus-market-md360.vercel.app',
    year:       new Date().getFullYear(),
  };

  // API v4 : send(serviceId, templateId, params)  — plus de 4ème argument userId
  return window.emailjs.send(
    EMAILJS_CONFIG.serviceId,
    EMAILJS_CONFIG.templates.order,
    templateParams
  );
}

// ── Envoyer un email de réinitialisation de mot de passe ─────────────────
export async function sendPasswordReset({ userName, userEmail, resetLink }) {
  if (!window.emailjs) throw new Error('EmailJS SDK non chargé');

  const templateParams = {
    to_name:    userName || 'Utilisateur',
    to_email:   userEmail,
    reset_link: resetLink,
    expiry:     '24 heures',
    year:       new Date().getFullYear(),
  };

  return window.emailjs.send(
    EMAILJS_CONFIG.serviceId,
    EMAILJS_CONFIG.templates.resetPassword,
    templateParams
  );
}

// ── Test d'envoi (utile pour vérifier la configuration) ──────────────────
export async function testEmailJS(toEmail) {
  return window.emailjs.send(
    EMAILJS_CONFIG.serviceId,
    EMAILJS_CONFIG.templates.order,
    {
      to_name:  'Test Admin',
      to_email:  toEmail || 'admin@nexus.sn',
      order_id: 'TEST-001',
      amount:   '0 FCFA',
      items:    'Produit de test',
      market_url: 'https://nexus-market-md360.vercel.app',
      year:     new Date().getFullYear(),
    }
  );
}

export { EMAILJS_CONFIG };
