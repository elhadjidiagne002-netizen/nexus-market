import { adminClient, requireRole } from "../../_lib/supabase.js";
import { handle, ok, err } from "../../_lib/response.js";

export const onRequest = handle(async ({ request, env, params }) => {
  await requireRole(env, request, ["admin"]);
  const { userId } = params;
  const sb = adminClient(env);

  if (request.method === "GET") {
    const { data, error } = await sb.from("b2b_profiles").select("*, profiles!user_id(*)").eq("user_id", userId).single();
    if (error) return err(error.message, 404);
    return ok(data);
  }

  if (request.method === "PATCH") {
    const body = await request.json();
    const { data, error } = await sb.from("b2b_profiles").update(body).eq("user_id", userId).select().single();
    if (error) return err(error.message);
    return ok(data);
  }

  return err("Méthode non autorisée", 405);
});
