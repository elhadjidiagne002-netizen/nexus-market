import { adminClient, extractToken } from "../_lib/supabase.js";
import { handle, ok, err } from "../_lib/response.js";

export const onRequest = handle(async ({ request, env }) => {
  if (request.method !== "POST") return err("Méthode non autorisée", 405);
  const { refresh_token } = await request.json().catch(() => ({}));
  if (!refresh_token) return err("refresh_token manquant");
  const sb = adminClient(env);
  const { data, error } = await sb.auth.refreshSession({ refresh_token });
  if (error) return err(error.message, 401);
  return ok(data.session);
});
