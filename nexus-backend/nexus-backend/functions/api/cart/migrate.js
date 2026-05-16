import { adminClient, requireAuth } from "../_lib/supabase.js";
import { handle, ok, err } from "../_lib/response.js";

export const onRequest = handle(async ({ request, env }) => {
  if (request.method !== "POST") return err("Méthode non autorisée", 405);
  const { user } = await requireAuth(env, request);
  const { localItems } = await request.json();
  const sb = adminClient(env);
  const { data: existing } = await sb.from("carts").select("items").eq("user_id", user.id).single();
  const serverItems = existing?.items || [];
  // Merge: server items take precedence, append local items not on server
  const serverIds = new Set(serverItems.map(i => i.id));
  const merged = [...serverItems, ...localItems.filter(i => !serverIds.has(i.id))];
  await sb.from("carts").upsert({ user_id: user.id, items: merged });
  return ok(merged);
});
