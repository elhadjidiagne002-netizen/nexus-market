// NOTE : ce handler (/api/webhooks/paytech) n'est branché par aucun ipn_url
// actuellement (le flux commande utilise /api/payments/paytech/ipn, le flux
// mobile-money /functions/paytech-webhook). Conservé et rendu schéma-valide
// par sécurité au cas où il serait câblé.
async function sha256(str) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

async function notifyVendor(env, order) {
  await fetch(`${env.SUPABASE_URL}/rest/v1/notifications`, {
    method: "POST",
    headers: {
      apikey: env.SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      user_id:  order.vendor_id,
      type:     "order",
      title:    "Nouvelle commande payee",
      message:  `Commande #${order.id.slice(0, 8)} - ${order.buyer_name} - ${order.total} FCFA`,
      link:     `/?order=${order.id}`,
      read:     false,
    }),
  }).catch(() => {});
}

async function sendBuyerConfirmation(env, order) {
  if (!env.RESEND_API_KEY) return;
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from:    "NEXUS Market <commandes@nexus.sn>",
      to:      order.buyer_email,
      subject: `Votre commande NEXUS #${order.id.slice(0, 8)} est confirmee`,
      html:    `<h2>Merci pour votre commande !</h2>
                <p>Bonjour ${order.buyer_name},</p>
                <p>Votre paiement a bien ete recu.</p>
                <p><strong>Montant :</strong> ${order.total?.toLocaleString("fr-FR")} FCFA</p>`,
    }),
  }).catch(() => {});
}

export async function onRequestPost({ request, env }) {
  const formData = await request.formData().catch(() => null);
  if (!formData) return new Response("Bad request", { status: 400 });

  const token     = formData.get("token");
  const typeEvent = formData.get("type_event");
  const apiKey    = formData.get("api_key_sha256");
  const apiSecret = formData.get("api_secret_sha256");

  const expectedKey    = await sha256(env.PAYTECH_API_KEY);
  const expectedSecret = await sha256(env.PAYTECH_SECRET_KEY);

  if (apiKey !== expectedKey || apiSecret !== expectedSecret) {
    return new Response("Unauthorized", { status: 401 });
  }

  const orderRes = await fetch(
    `${env.SUPABASE_URL}/rest/v1/orders?mobile_money_ref=eq.${encodeURIComponent(token)}&select=*`,
    { headers: { apikey: env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}` } }
  );
  const orders = await orderRes.json();
  const order = orders[0];
  if (!order) return new Response("Order not found", { status: 404 });

  if (typeEvent === "sale_complete") {
    await fetch(`${env.SUPABASE_URL}/rest/v1/orders?id=eq.${order.id}`, {
      method: "PATCH",
      headers: {
        apikey: env.SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({ status: "processing", payment_status: "paid", updated_at: new Date().toISOString() }),
    });
    await notifyVendor(env, order);
    await sendBuyerConfirmation(env, order);

  } else if (typeEvent === "sale_canceled") {
    await fetch(`${env.SUPABASE_URL}/rest/v1/orders?id=eq.${order.id}`, {
      method: "PATCH",
      headers: {
        apikey: env.SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ status: "cancelled", updated_at: new Date().toISOString() }),
    });

    const products = Array.isArray(order.products) ? order.products : [];
    await Promise.all(products.map(item =>
      fetch(`${env.SUPABASE_URL}/rest/v1/rpc/increment_stock`, {
        method: "POST",
        headers: {
          apikey: env.SUPABASE_SERVICE_KEY,
          Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ p_id: item.id, p_qty: item.quantity || 1 }),
      })
    ));
  }

  return new Response("OK", { status: 200 });
}
