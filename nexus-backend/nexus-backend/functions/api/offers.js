import { adminClient, requireAuth } from "./_lib/supabase.js";
import { handle, ok, err } from "./_lib/response.js";

export const onRequest = handle(async ({ request, env }) => {
  const { user } = await requireAuth(env, request);
  const sb = adminClient(env);
  const url = new URL(request.url);

  if (request.method === "GET") {
    const { data: profile } = await sb.from("profiles").select("role").eq("id", user.id).single();
    let q = sb.from("offers").select("*").order("created_at", { ascending: false });
    if (profile?.role === "vendor") q = q.eq("vendor_id", user.id);
    else q = q.eq("buyer_id", user.id);
    const { data, error } = await q;
    if (error) return err(error.message);
    return ok(data);
  }

  if (request.method === "POST") {
    const body = await request.json();
    const { data, error } = await sb.from("offers").insert({ ...body, buyer_id: user.id, status: "pending" }).select().single();
    if (error) return err(error.message);
    return ok(data, 201);
  }

  if (request.method === "PATCH") {
    const id = url.searchParams.get("id");
    const { status } = await request.json();
    const { data, error } = await sb.from("offers").update({ status }).eq("id", id).select().single();
    if (error) return err(error.message);
    return ok(data);
  }

  return err("Méthode non autorisée", 405);
});
