import { adminClient, requireRole } from "../_lib/supabase.js";
import { handle, ok, err } from "../_lib/response.js";

export const onRequest = handle(async ({ request, env }) => {
  await requireRole(env, request, ["admin"]);
  const sb = adminClient(env);
  const url = new URL(request.url);
  const status = url.searchParams.get("status");

  if (request.method === "GET") {
    let q = sb.from("payout_requests").select("*, profiles!vendor_id(name,email,shop_name)").order("created_at", { ascending: false });
    if (status) q = q.eq("status", status);
    const { data, error } = await q;
    if (error) return err(error.message);
    return ok(data);
  }

  if (request.method === "PATCH") {
    const id = url.searchParams.get("id");
    const body = await request.json();
    const { data, error } = await sb.from("payout_requests").update(body).eq("id", id).select().single();
    if (error) return err(error.message);
    return ok(data);
  }

  return err("Méthode non autorisée", 405);
});
