import { adminClient, requireAuth } from "../_lib/supabase.js";
import { handle, ok, err } from "../_lib/response.js";

export const onRequest = handle(async ({ request, env }) => {
  if (request.method !== "POST") return err("Méthode non autorisée", 405);
  const { user } = await requireAuth(env, request);
  const { fromId } = await request.json();
  const sb = adminClient(env);
  await sb.from("messages").update({ read: true }).eq("to_id", user.id).eq("from_id", fromId);
  return ok({ updated: true });
});
