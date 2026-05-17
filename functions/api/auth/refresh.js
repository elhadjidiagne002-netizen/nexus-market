// functions/api/auth/refresh.js
// Renouveller un access token expire via refresh_token Supabase
import { adminClient } from "../_lib/supabase.js";
import { handle, ok, err } from "../_lib/response.js";

export const onRequest = handle(async ({ request, env }) => {
  if (request.method !== "POST") return err("POST requis", 405);

  const body = await request.json().catch(() => ({}));
  const refreshToken = body.refreshToken || body.refresh_token;
  if (!refreshToken) return err("refreshToken requis", 400);

  const sb = adminClient(env);
  const { data, error } = await sb.auth.refreshSession({ refresh_token: refreshToken });

  if (error || !data?.session) {
    return err("Session expiree. Reconnectez-vous.", 401);
  }

  return ok({
    accessToken:  data.session.access_token,
    token:        data.session.access_token,
    refreshToken: data.session.refresh_token,
    expiresIn:    data.session.expires_in || 3600,
  });
});