import { adminClient, requireAuth } from "../_lib/supabase.js";
import { handle, ok } from "../_lib/response.js";

export const onRequest = handle(async ({ request, env }) => {
  const { user } = await requireAuth(env, request);
  const sb = adminClient(env);
  const { data: profile } = await sb.from("profiles").select("*").eq("id", user.id).single();
  return ok({ ...user, ...profile });
});
