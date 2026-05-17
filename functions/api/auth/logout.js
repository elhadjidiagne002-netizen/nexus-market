// functions/api/auth/logout.js
import { adminClient, requireAuth } from "../_lib/supabase.js";
import { handle, ok, err } from "../_lib/response.js";

export const onRequest = handle(async ({ request, env }) => {
  if (request.method !== "POST") return err("POST requis", 405);
  try {
    const { user } = await requireAuth(env, request).catch(() => ({ user: null }));
    const sb = adminClient(env);
    if (user) await sb.auth.admin.signOut(user.id).catch(() => {});
  } catch (_) {}
  return ok({ success: true, message: "Deconnecte" });
});