import { adminClient } from "../_lib/supabase.js";
import { handle, ok, err } from "../_lib/response.js";

export const onRequest = handle(async ({ request, env }) => {
  const sb = adminClient(env);
  const { data, error } = await sb.from("ambassadors")
    .select("id, user_id, level, total_referrals, total_earned, total_sales, commission_rate, profiles!user_id(name, avatar)")
    .eq("active", true)
    .order("total_earned", { ascending: false })
    .limit(20);
  if (error) return err(error.message);
  return ok(data || []);
});
