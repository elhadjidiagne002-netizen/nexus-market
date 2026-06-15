// functions/api/order-email.js → POST /api/order-email
// Endpoint INTERNE (X-Internal-Secret) : envoie l'email de confirmation de commande
// à l'acheteur, côté serveur, indépendamment de son authentification (checkout
// invité inclus). Appelé par le trigger DB trg_order_confirm_email via pg_net.
// Rend le template via sendEventEmail (Resend -> Brevo) + journalise.
import { isInternalCall, json, err, options } from './_lib/utils.js';
import { sendEventEmail } from './_lib/notify.js';

export async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') return options();
  if (request.method !== 'POST') return err('POST requis', 405);

  // Appel SERVEUR→SERVEUR uniquement (anti-relais ouvert).
  if (!isInternalCall(request, env)) return json({ ok: false, skipped: 'not_internal' }, 401);

  let body;
  try { body = await request.json(); } catch { return err('JSON invalide', 400); }
  const { to, order_id, buyer_name, total, vendor_email } = body || {};

  if (!to || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(to))) {
    return json({ ok: true, skipped: 'no_recipient' });
  }

  // Email acheteur : "commande confirmée/enregistrée".
  const rBuyer = await sendEventEmail(env, 'order_confirmed', to, {
    buyer_name: buyer_name || 'Client',
    order_id: order_id ? String(order_id).slice(0, 8).toUpperCase() : '',
    total: total != null ? String(total) : '',
    _orderId: order_id || null,
  });

  // Email vendeur (optionnel) : "nouvelle commande" — en complément de la notif in-app/push.
  let rVendor = null;
  if (vendor_email && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(vendor_email))) {
    rVendor = await sendEventEmail(env, 'vendor_new_order', vendor_email, {
      order_id: order_id ? String(order_id).slice(0, 8).toUpperCase() : '',
      total: total != null ? String(total) : '',
    }).catch(() => null);
  }

  return json({ ok: true, buyer: rBuyer, vendor: rVendor });
}
