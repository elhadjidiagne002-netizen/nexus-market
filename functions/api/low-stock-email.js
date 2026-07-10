// functions/api/low-stock-email.js → POST /api/low-stock-email
// Endpoint INTERNE (X-Internal-Secret) : alerte « stock faible » au vendeur quand
// un produit franchit son seuil. Appelé par le trigger DB trg_low_stock_alert (pg_net).
import { isInternalCall, json, err, options } from './_lib/utils.js';
import { sendEventNotification } from './_lib/notify.js';

export async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') return options();
  if (request.method !== 'POST') return err('POST requis', 405);
  if (!isInternalCall(request, env)) return json({ ok: false, skipped: 'not_internal' }, 401);

  let body;
  try { body = await request.json(); } catch { return err('JSON invalide', 400); }
  const { to, phone, vendor_name, product_name, stock } = body || {};
  const toValid = to && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(to));
  if (!toValid && !phone) {
    return json({ ok: true, skipped: 'no_recipient' });
  }

  const r = await sendEventNotification(env, 'low_stock', { email: toValid ? to : null, phone }, {
    vendor_name: vendor_name || 'Vendeur',
    product_name: product_name || 'votre produit',
    stock: stock != null ? String(stock) : '',
  });
  return json({ ok: true, result: r });
}
