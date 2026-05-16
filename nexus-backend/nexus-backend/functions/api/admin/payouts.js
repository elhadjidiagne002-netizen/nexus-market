import { adminClient, requireRole } from "../_lib/supabase.js";
import { handle, ok, err } from "../_lib/response.js";

export const onRequest = handle(async ({ request, env }) => {
  await requireRole(env, request, ["admin"]);
  const sb = adminClient(env);
  const { data, error } = await sb.from("payout_requests").select("*, profiles!vendor_id(name,email,phone)").order("created_at", { ascending: false });
  if (error) return err(error.message);
  return ok(data);
});
