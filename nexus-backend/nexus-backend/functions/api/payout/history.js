import { adminClient, requireAuth } from "../_lib/supabase.js";
import { handle, ok, err } from "../_lib/response.js";

export const onRequest = handle(async ({ request, env }) => {
  const { user } = await requireAuth(env, request);
  const sb = adminClient(env);
  const { data, error } = await sb.from("payout_requests").select("*").eq("vendor_id", user.id).order("created_at", { ascending: false });
  if (error) return err(error.message);
  return ok(data);
});
