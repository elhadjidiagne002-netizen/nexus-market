import { adminClient, requireAuth } from "./_lib/supabase.js";
import { handle, ok, err } from "./_lib/response.js";

export const onRequest = handle(async ({ request, env }) => {
  const { user } = await requireAuth(env, request);
  const sb = adminClient(env);
  const url = new URL(request.url);

  if (request.method === "GET") {
    const { data: profile } = await sb.from("profiles").select("role").eq("id", user.id).single();
    let q = sb.from("disputes").select("*, orders!order_id(vendor_id,buyer_id,total,products)").order("created_at", { ascending: false });
    if (profile?.role !== "admin") q = q.or("buyer_id.eq." + user.id + ",vendor_id.eq." + user.id);
    const { data, error } = await q;
    if (error) return err(error.message);
    return ok(data);
  }

  if (request.method === "POST") {
    const body = await request.json();
    const { data: existing } = await sb.from("disputes").select("id").eq("order_id", body.order_id).single();
    if (existing) return err("Un litige existe déjà pour cette commande");
    const { data: order } = await sb.from("orders").select("vendor_id").eq("id", body.order_id).single();
    const { data, error } = await sb.from("disputes").insert({
      ...body, buyer_id: user.id, vendor_id: order?.vendor_id, status: "open"
    }).select().single();
    if (error) return err(error.message);
    await sb.from("orders").update({ dispute_id: data.id, dispute_status: "open" }).eq("id", body.order_id);
    return ok(data, 201);
  }

  if (request.method === "PATCH") {
    const id = url.searchParams.get("id");
    const body = await request.json();
    const { data, error } = await sb.from("disputes").update(body).eq("id", id).select().single();
    if (error) return err(error.message);
    return ok(data);
  }

  return err("Méthode non autorisée", 405);
});
