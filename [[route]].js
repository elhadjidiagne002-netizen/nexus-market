import { options, json, err, supabase, requireAuth } from "../_lib/utils.js";

async function sbFetch(env, path, opts = {}) {
  return fetch(`${env.SUPABASE_URL}/rest/v1${path}`, {
    ...opts,
    headers: {
      apikey: env.SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(opts.headers || {}),
    },
  });
}

export async function onRequest({ request, env }) {
  if (request.method === "OPTIONS") return options();

  const url = new URL(request.url);
  const route = url.pathname.replace(/^\/api\/orders\/?/, "") || "";

  try {
    // POST /api/orders — creation atomique
    if (!route && request.method === "POST") {
      const [user, authErr] = await requireAuth(request, env);
      if (authErr) return authErr;

      const body = await request.json().catch(() => null);
      if (!body) return err("Corps JSON invalide", 400);

      const { products, ...orderData } = body;
      if (!products?.length) return err("Panier vide", 400);

      const rpcRes = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/create_order_atomic`, {
        method: "POST",
        headers: {
          apikey: env.SUPABASE_SERVICE_KEY,
          Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          items_json: JSON.stringify(products),
          order_json: JSON.stringify({ ...orderData, buyer_id: user.id }),
        }),
      });

      const rpcData = await rpcRes.json().catch(() => null);

      if (!rpcRes.ok) {
        const msg = rpcData?.message || rpcData?.hint || "";
        if (msg.includes("STOCK_INSUFFICIENT")) {
          const match = msg.match(/STOCK_INSUFFICIENT: (\[.*\])/s);
          const items = match ? JSON.parse(match[1]) : [];
          return json({ code: "STOCK_INSUFFICIENT", detail: "Stock insuffisant", items }, 409);
        }
        return err(msg || "Erreur creation commande", 502);
      }
      return json(rpcData, 201);
    }

    // GET /api/orders — liste
    if (!route && request.method === "GET") {
      const [user, authErr] = await requireAuth(request, env);
      if (authErr) return authErr;

      const sb = supabase(env);
      const profile = await sb.from("profiles").select("role", `email=eq.${encodeURIComponent(user.email)}`);
      const role = profile?.[0]?.role || "buyer";

      let filter = role === "admin"
        ? "/orders?order=created_at.desc&limit=200"
        : `/orders?buyer_id=eq.${user.id}&order=created_at.desc`;

      const limit = url.searchParams.get("limit");
      if (limit) filter += `&limit=${limit}`;

      const res = await sbFetch(env, filter);
      const data = await res.json();
      return json({ orders: data });
    }

    // POST /api/orders/:id/cancel
    const cancelMatch = route.match(/^([^/]+)\/cancel$/);
    if (cancelMatch && request.method === "POST") {
      const [user, authErr] = await requireAuth(request, env);
      if (authErr) return authErr;

      const orderId = cancelMatch[1];
      const orderRes = await sbFetch(env, `/orders?id=eq.${orderId}&select=*`);
      const orders = await orderRes.json();
      const order = orders[0];

      if (!order) return err("Commande introuvable", 404);
      if (order.status === "paid") return err("Commande deja payee - ouvrir un litige", 400);

      const products = Array.isArray(order.products) ? order.products : [];
      await Promise.all(
        products.map(item =>
          fetch(`${env.SUPABASE_URL}/rest/v1/rpc/increment_stock`, {
            method: "POST",
            headers: {
              apikey: env.SUPABASE_SERVICE_KEY,
              Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ p_id: item.id, p_qty: item.quantity || 1 }),
          })
        )
      );

      await sbFetch(env, `/orders?id=eq.${orderId}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "cancelled", updated_at: new Date().toISOString() }),
      });

      return json({ success: true, orderId, status: "cancelled" });
    }

    // PATCH /api/orders/:id
    const idMatch = route.match(/^([^/]+)$/);
    if (idMatch && request.method === "PATCH") {
      const [user, authErr] = await requireAuth(request, env);
      if (authErr) return authErr;

      const orderId = idMatch[1];
      const body = await request.json().catch(() => ({}));
      const patch = {};
      for (const key of ["status", "tracking_number"]) {
        if (body[key] !== undefined) patch[key] = body[key];
      }
      patch.updated_at = new Date().toISOString();

      const res = await sbFetch(env, `/orders?id=eq.${orderId}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      });
      const data = await res.json();
      return json(data[0] || { success: true });
    }

    return err("Route commande inconnue", 404);
  } catch (e) {
    return err(e.message, e.status || 500);
  }
}
