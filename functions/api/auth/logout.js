import { adminClient, extractToken } from "../_lib/supabase.js";
import { handle, ok } from "../_lib/response.js";

export const onRequest = handle(async ({ request, env }) => {
  const token = extractToken(request);
  if (token) {
    const sb = adminClient(env);
    await sb.auth.admin.signOut(token).catch(() => {});
  }
  return ok({ message: "Déconnecté" });
});
