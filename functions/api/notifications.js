import { adminClient, requireAuth } from "./_lib/supabase.js";
import { handle, ok, err } from "./_lib/response.js";

export const onRequest = handle(async ({ request, env }) => {
  const { user } = await requireAuth(env, request);
  const sb = adminClient(env);
  const url = new URL(request.url);

  if (request.method === "GET") {
    const { data, error } = await sb.from("notifications").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(50);
    if (error) return err(error.message);
    return ok(data);
  }

  if (request.method === "PATCH") {
    const id = url.searchParams.get("id");
    if (id) {
      await sb.from("notifications").update({ read: true }).eq("id", id).eq("user_id", user.id);
    } else {
      await sb.from("notifications").update({ read: true }).eq("user_id", user.id);
    }
    return ok({ updated: true });
  }

  return err("Méthode non autorisée", 405);
});
