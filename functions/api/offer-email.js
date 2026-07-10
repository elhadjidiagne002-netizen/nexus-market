// functions/api/offer-email.js → POST /api/offer-email
// Endpoint INTERNE (X-Internal-Secret) : à chaque offre/demande d'achat sur une
// story, envoie un email au VENDEUR (détails + contact acheteur) et un accusé à
// l'ACHETEUR (même invité). Appelé par le trigger DB trg_offer_emails via pg_net.
import { isInternalCall, json, err, options } from './_lib/utils.js';
import { sendEventNotification } from './_lib/notify.js';

const EUR_TO_XOF = 655.957;
function fcfa(amount) {
  if (amount == null || amount === '') return '';
  const n = Number(amount);
  if (!isFinite(n) || n <= 0) return '';
  return Math.round(n * EUR_TO_XOF).toLocaleString('fr-FR') + ' FCFA';
}

export async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') return options();
  if (request.method !== 'POST') return err('POST requis', 405);
  if (!isInternalCall(request, env)) return json({ ok: false, skipped: 'not_internal' }, 401);

  let body;
  try { body = await request.json(); } catch { return err('JSON invalide', 400); }
  const {
    kind, offer_id, story_title, buyer_name, buyer_phone, buyer_email, amount, message, vendor_email, vendor_phone,
  } = body || {};

  const ref = offer_id ? String(offer_id).slice(0, 8).toUpperCase() : '';
  const amountStr = fcfa(amount);
  const isBuy = kind === 'buy';

  // Email + WhatsApp vendeur : nouvelle offre / demande d'achat.
  const vendorEmailValid = vendor_email && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(vendor_email));
  let rVendor = null;
  if (vendorEmailValid || vendor_phone) {
    rVendor = await sendEventNotification(env, 'new_offer', { email: vendorEmailValid ? vendor_email : null, phone: vendor_phone }, {
      story_title: story_title || 'votre story',
      kind_label: isBuy ? 'Demande d’achat' : 'Offre',
      buyer_name: buyer_name || 'Un client',
      buyer_phone: buyer_phone || '',
      buyer_email: buyer_email || '',
      amount: amountStr,
      message: message || '',
      offer_id: ref,
    }).catch(() => null);
  }

  // Accusé acheteur (email obligatoire côté formulaire ; téléphone souvent
  // disponible aussi → accusé WhatsApp en plus).
  const buyerEmailValid = buyer_email && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(buyer_email));
  let rBuyer = null;
  if (buyerEmailValid || buyer_phone) {
    rBuyer = await sendEventNotification(env, 'offer_submitted', { email: buyerEmailValid ? buyer_email : null, phone: buyer_phone }, {
      buyer_name: buyer_name || 'Bonjour',
      story_title: story_title || 'la story',
      kind_label: isBuy ? 'demande d’achat' : 'offre',
      amount: amountStr,
      offer_id: ref,
    }).catch(() => null);
  }

  return json({ ok: true, vendor: rVendor, buyer: rBuyer });
}
