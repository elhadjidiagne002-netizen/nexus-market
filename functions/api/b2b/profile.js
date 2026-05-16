import { adminClient, requireAuth } from "../_lib/supabase.js";
import { handle, ok, err } from "../_lib/response.js";

export const onRequest = handle(async ({ request, env }) => {
  const { user } = await requireAuth(env, request);
  const sb = adminClient(env);

  if (request.method === "GET") {
    const { data, error } = await sb.from("b2b_profiles").select("*").eq("user_id", user.id).single();
    if (error && error.code !== "PGRST116") return err(error.message);
    return ok(data || null);
  }

  if (request.method === "POST" || request.method === "PATCH") {
    const body = await request.json();
    const { data, error } = await sb.from("b2b_profiles").upsert({ ...body, user_id: user.id }).select().single();
    if (error) return err(error.message);
    return ok(data);
  }

  return err("Méthode non autorisée", 405);
});
