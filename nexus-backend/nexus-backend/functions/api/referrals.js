import { adminClient, requireAuth } from "./_lib/supabase.js";
import { handle, ok, err } from "./_lib/response.js";

export const onRequest = handle(async ({ request, env }) => {
  const { user } = await requireAuth(env, request);
  const sb = adminClient(env);

  if (request.method === "GET") {
    const { data, error } = await sb.from("referrals").select("*, profiles!referred_id(name,email,created_at)").eq("referrer_id", user.id).order("created_at", { ascending: false });
    if (error) return err(error.message);
    return ok(data);
  }

  return err("Méthode non autorisée", 405);
});
