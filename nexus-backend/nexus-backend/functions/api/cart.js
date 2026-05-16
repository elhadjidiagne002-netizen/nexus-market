import { adminClient, requireAuth } from "./_lib/supabase.js";
import { handle, ok, err } from "./_lib/response.js";

export const onRequest = handle(async ({ request, env }) => {
  const { user } = await requireAuth(env, request);
  const sb = adminClient(env);

  if (request.method === "GET") {
    const { data } = await sb.from("carts").select("items").eq("user_id", user.id).single();
    return ok(data?.items || []);
  }
  if (request.method === "PUT") {
    const { items } = await request.json();
    await sb.from("carts").upsert({ user_id: user.id, items, updated_at: new Date().toISOString() });
    return ok({ saved: true });
  }
  if (request.method === "DELETE") {
    await sb.from("carts").delete().eq("user_id", user.id);
    return ok({ cleared: true });
  }
  return err("Méthode non autorisée", 405);
});
