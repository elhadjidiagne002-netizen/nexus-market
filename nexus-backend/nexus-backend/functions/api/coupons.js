import { adminClient, requireAuth } from "./_lib/supabase.js";
import { handle, ok, err } from "./_lib/response.js";

export const onRequest = handle(async ({ request, env }) => {
  const { user } = await requireAuth(env, request);
  const sb = adminClient(env);
  const url = new URL(request.url);

  if (request.method === "GET") {
    const { data, error } = await sb.from("coupons").select("*").eq("active", true).order("created_at", { ascending: false });
    if (error) return err(error.message);
    return ok(data);
  }

  if (request.method === "POST") {
    const body = await request.json();
    const { data, error } = await sb.from("coupons").insert({ ...body, created_by: user.id }).select().single();
    if (error) return err(error.message);
    return ok(data, 201);
  }

  if (request.method === "PATCH") {
    const id = url.searchParams.get("id");
    const body = await request.json();
    const { data, error } = await sb.from("coupons").update(body).eq("id", id).select().single();
    if (error) return err(error.message);
    return ok(data);
  }

  if (request.method === "DELETE") {
    const id = url.searchParams.get("id");
    await sb.from("coupons").delete().eq("id", id);
    return ok({ deleted: true });
  }

  return err("Méthode non autorisée", 405);
});
