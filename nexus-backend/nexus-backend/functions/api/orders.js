import { adminClient, requireAuth } from "./_lib/supabase.js";
import { handle, ok, err } from "./_lib/response.js";

export const onRequest = handle(async ({ request, env }) => {
  const sb = adminClient(env);
  const { user } = await requireAuth(env, request);
  const url = new URL(request.url);

  if (request.method === "GET") {
    const { data: profile } = await sb.from("profiles").select("role").eq("id", user.id).single();
    const role = profile?.role;
    let query = sb.from("orders").select("*").order("created_at", { ascending: false });
    if (role === "vendor") query = query.eq("vendor_id", user.id);
    else if (role !== "admin") query = query.eq("buyer_id", user.id);
    const { data, error } = await query;
    if (error) return err(error.message);
    return ok(data);
  }

  if (request.method === "POST") {
    const body = await request.json();
    const order = {
      ...body,
      buyer_id: user.id,
      status: body.status || "pending_payment",
      created_at: new Date().toISOString()
    };
    const { data, error } = await sb.from("orders").insert(order).select().single();
    if (error) return err(error.message);

    // Award loyalty points (1 pt per 100 FCFA)
    const pts = Math.floor((order.total || 0) / 100);
    if (pts > 0) {
      await sb.from("loyalty_points").upsert({
        user_id: user.id,
        points: pts,
        transaction_type: "earn",
        order_id: data.id,
        description: "Commande " + data.id
      }).catch(() => {});
    }

    return ok(data, 201);
  }

  if (request.method === "PATCH") {
    const id = url.searchParams.get("id");
    if (!id) return err("id manquant");
    const body = await request.json();
    const { data, error } = await sb.from("orders").update(body).eq("id", id).select().single();
    if (error) return err(error.message);
    return ok(data);
  }

  return err("Méthode non autorisée", 405);
});
