// functions/api/order-email.js → POST /api/order-email
// Endpoint INTERNE (X-Internal-Secret) : envoie l'email de confirmation de commande
// à l'acheteur, côté serveur, indépendamment de son authentification (checkout
// invité inclus). Appelé par le trigger DB trg_order_confirm_email via pg_net.
// Rend le template (éditeur admin ou défaut de marque) via sendEventEmail.
import { isInternalCall, json, err, options } from './_lib/utils.js';
import { sendEventNotification } from './_lib/notify.js';

// orders.total est observé en EUR (cf. CLAUDE.md ; les triggers WhatsApp font la
// même conversion). On affiche donc le montant converti en FCFA, formaté fr-FR.
const EUR_TO_XOF = 655.957;
function fcfa(total) {
  if (total == null || total === '') return '';
  const n = Number(total);
  if (!isFinite(n)) return '';
  return Math.round(n * EUR_TO_XOF).toLocaleString('fr-FR') + ' FCFA';
}

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// products (jsonb) → liste HTML « Article × qté ». Tolérant aux formes de champ.
function itemsHtml(products) {
  let arr = products;
  if (typeof arr === 'string') { try { arr = JSON.parse(arr); } catch { arr = []; } }
  if (!Array.isArray(arr) || !arr.length) return '';
  const rows = arr.map((it) => {
    const name = it.name || it.title || it.product_name || 'Article';
    const qty = it.quantity || it.qty || it.qte || 1;
    return `<li>${escapeHtml(name)} × ${escapeHtml(qty)}</li>`;
  }).join('');
  return `<ul style="margin:0;padding-left:18px">${rows}</ul>`;
}

export async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') return options();
  if (request.method !== 'POST') return err('POST requis', 405);

  // Appel SERVEUR→SERVEUR uniquement (anti-relais ouvert).
  if (!isInternalCall(request, env)) return json({ ok: false, skipped: 'not_internal' }, 401);

  let body;
  try { body = await request.json(); } catch { return err('JSON invalide', 400); }
  const {
    to, order_id, buyer_name, buyer_phone, total, vendor_email,
    vendor_name, buyer_address, shipping_city, tracking_number, created_at, products,
  } = body || {};

  const toValid = to && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(to));
  if (!toValid && !buyer_phone) {
    return json({ ok: true, skipped: 'no_recipient' });
  }

  const orderRef = order_id ? String(order_id).slice(0, 8).toUpperCase() : '';
  const totalStr = fcfa(total);
  const address = [buyer_address, shipping_city].filter(Boolean).join(', ');
  let orderDate = '';
  try { if (created_at) orderDate = new Date(created_at).toLocaleDateString('fr-FR'); } catch { /* ignore */ }

  // Email + WhatsApp acheteur : "commande confirmée". Variables alignées sur le
  // template configurable order_confirmation (buyer_name, order_id, order_date,
  // total, tracking, address, vendor_name, items).
  const rBuyer = await sendEventNotification(env, 'order_confirmed', { email: toValid ? to : null, phone: buyer_phone }, {
    buyer_name: buyer_name || 'Client',
    order_id: orderRef,
    order_date: orderDate,
    total: totalStr,
    tracking: tracking_number || '',
    address,
    vendor_name: vendor_name || '',
    items: itemsHtml(products),
    _orderId: order_id || null,
  });

  // Email vendeur (optionnel) : "nouvelle commande" — complément de la notif
  // in-app/push. WhatsApp NON dupliqué ici : le trigger DB
  // trg_new_order_vendor_whatsapp envoie déjà un message équivalent au vendeur
  // à l'INSERT de la commande (cf. sql/2026_06_16_fix_orders_whatsapp_trigger_left_uuid.sql).
  let rVendor = null;
  if (vendor_email && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(vendor_email))) {
    rVendor = await sendEventNotification(env, 'vendor_new_order', { email: vendor_email }, {
      vendor_name: vendor_name || 'Vendeur',
      order_id: orderRef,
      total: totalStr,
      items: itemsHtml(products),
    }).catch(() => null);
  }

  return json({ ok: true, buyer: rBuyer, vendor: rVendor });
}
