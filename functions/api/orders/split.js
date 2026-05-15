// POST /api/orders/split
// Crée une commande par vendeur de façon atomique via create_order_atomic().
// Corps : { cart, customerInfo, shippingCity, paymentMethod, discountAmount }
// Réponse : { ok, orders: [...] }
import { requireRole, jsonOk, jsonErr } from "../../_lib/auth.js";

export async function onRequestPost(context) {
  const { request, env } = context;
  const { user, error } = await requireRole(request, env, null); // tout utilisateur connecté
  if (error) return error;

  let body;
  try { body = await request.json(); } catch { return jsonErr("JSON invalide", 400); }

  const { cart, customerInfo, shippingCity, paymentMethod, discountAmount = 0 } = body || {};
  if (!Array.isArray(cart) || cart.length === 0) return jsonErr("Panier vide", 400);

  // Grouper les articles par vendeur
  const byVendor = {};
  for (const item of cart) {
    const vid = item.vendor_id || item.vendor || "unknown";
    if (!byVendor[vid]) byVendor[vid] = { vendorId: vid, vendorName: item.vendorName || "Vendeur", items: [] };
    byVendor[vid].items.push(item);
  }

  const vendorGroups = Object.values(byVendor);
  const discountPerVendor = discountAmount / vendorGroups.length;
  const { SUPABASE_URL: url, SUPABASE_SERVICE_KEY: key } = env;

  const createdOrders = [];
  const errors = [];

  for (const group of vendorGroups) {
    const total = group.items.reduce((s, i) => s + (i.price || 0) * (i.quantity || 1), 0)
                  - discountPerVendor;
    const orderId = "ORD-" + Date.now() + "-" + Math.random().toString(36).slice(2, 7).toUpperCase();
    const trackingNumber = "TRK" + Date.now().toString(36).toUpperCase().slice(-6);

    const orderData = {
      id:           orderId,
      buyer:        user.id,
      total:        Math.max(0, total),
      status:       "processing",
      paymentMethod,
      buyerName:    customerInfo?.name,
      buyerEmail:   customerInfo?.email,
      buyerAddress: `${customerInfo?.address || ""}, ${customerInfo?.postalCode || ""} ${shippingCity || ""}`.trim(),
      vendorId:     group.vendorId,
    };

    // Appel RPC create_order_atomic
    const rpcRes = await fetch(`${url}/rest/v1/rpc/create_order_atomic`, {
      method:  "POST",
      headers: { "Content-Type": "application/json", "apikey": key, "Authorization": `Bearer ${key}` },
      body:    JSON.stringify({
        items_json: JSON.stringify(group.items),
        order_json: JSON.stringify(orderData),
      }),
    }).catch(() => null);

    if (rpcRes?.ok) {
      const saved = await rpcRes.json().catch(() => ({}));
      createdOrders.push({
        id:            saved.id || orderId,
        vendor:        group.vendorId,
        vendorName:    group.vendorName,
        products:      group.items,
        total:         Math.max(0, total),
        status:        "processing",
        trackingNumber,
        date:          new Date().toISOString(),
      });
    } else {
      const errText = await rpcRes?.text().catch(() => "");
      if (errText.includes("STOCK_INSUFFICIENT")) {
        return new Response(JSON.stringify({
          ok: false, code: "STOCK_INSUFFICIENT",
          items: [], message: errText,
        }), { status: 409, headers: { "Content-Type": "application/json" } });
      }
      errors.push({ vendorId: group.vendorId, error: errText });
    }
  }

  if (createdOrders.length === 0) {
    return jsonErr(`Aucune commande créée. Erreurs : ${JSON.stringify(errors)}`, 502);
  }

  return jsonOk({ ok: true, orders: createdOrders, errors });
}
