import { adminClient, requireRole } from "../../_lib/supabase.js";
import { handle, ok, err } from "../../_lib/response.js";

export const onRequest = handle(async ({ request, env }) => {
  await requireRole(env, request, ["admin"]);
  const sb = adminClient(env);
  if (request.method === "GET") {
    const { data, error } = await sb.from("pending_vendors").select("*").order("created_at", { ascending: false });
    if (error) return err(error.message);
    return ok(data);
  }
  return err("Méthode non autorisée", 405);
});
