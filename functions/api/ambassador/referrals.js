import { adminClient, requireAuth } from "../_lib/supabase.js";
import { handle, ok, err } from "../_lib/response.js";

export const onRequest = handle(async ({ request, env }) => {
  const { user } = await requireAuth(env, request);
  const sb = adminClient(env);

  const { data: amb } = await sb.from("ambassadors").select("id").eq("user_id", user.id).single();
  if (!amb) return ok([]);

  const { data, error } = await sb.from("ambassador_referrals")
    .select("*, profiles!referred_user_id(name, email, created_at, role)")
    .eq("ambassador_id", amb.id)
    .order("created_at", { ascending: false });

  if (error) return err(error.message);
  return ok(data || []);
});
