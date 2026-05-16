import { adminClient, requireAuth } from "./_lib/supabase.js";
import { handle, ok, err } from "./_lib/response.js";

export const onRequest = handle(async ({ request, env }) => {
  const sb = adminClient(env);
  const url = new URL(request.url);

  if (request.method === "GET") {
    let query = sb.from("products").select("*, profiles!vendor_id(name,logo,shop_name,rating)");
    const vendorId = url.searchParams.get("vendor_id");
    const category = url.searchParams.get("category");
    const moderated = url.searchParams.get("moderated");
    const limit = parseInt(url.searchParams.get("limit") || "100");
    if (vendorId) query = query.eq("vendor_id", vendorId);
    if (category) query = query.eq("category", category);
    if (moderated === "true") query = query.eq("moderated", true);
    query = query.order("created_at", { ascending: false }).limit(limit);
    const { data, error } = await query;
    if (error) return err(error.message);
    return ok(data);
  }

  if (request.method === "POST") {
    const { user } = await requireAuth(env, request);
    const body = await request.json();
    const { data, error } = await sb.from("products").insert({ ...body, vendor_id: user.id, moderated: false }).select().single();
    if (error) return err(error.message);
    return ok(data, 201);
  }

  if (request.method === "PUT" || request.method === "PATCH") {
    const { user } = await requireAuth(env, request);
    const id = url.searchParams.get("id");
    if (!id) return err("id manquant");
    const body = await request.json();
    const { data, error } = await sb.from("products").update(body).eq("id", id).eq("vendor_id", user.id).select().single();
    if (error) return err(error.message);
    return ok(data);
  }

  if (request.method === "DELETE") {
    const { user } = await requireAuth(env, request);
    const id = url.searchParams.get("id");
    if (!id) return err("id manquant");
    await sb.from("products").delete().eq("id", id).eq("vendor_id", user.id);
    return ok({ deleted: true });
  }

  return err("Méthode non autorisée", 405);
});
