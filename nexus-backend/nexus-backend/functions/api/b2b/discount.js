import { adminClient, requireAuth } from "../_lib/supabase.js";
import { handle, ok, err } from "../_lib/response.js";

export const onRequest = handle(async ({ request, env }) => {
  const { user } = await requireAuth(env, request);
  const sb = adminClient(env);
  const { data } = await sb.from("b2b_profiles").select("discount_rate,verified,tier").eq("user_id", user.id).single();
  return ok({ discount: data?.discount_rate || 0, verified: data?.verified || false, tier: data?.tier || "standard" });
});
