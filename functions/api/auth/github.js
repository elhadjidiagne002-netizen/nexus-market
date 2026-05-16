import { adminClient } from "../_lib/supabase.js";
import { handle, err } from "../_lib/response.js";
import { CORS } from "../_lib/response.js";

export const onRequest = handle(async ({ request, env }) => {
  const sb = adminClient(env);
  const { data, error } = await sb.auth.signInWithOAuth({
    provider: "github",
    options: { redirectTo: env.SITE_URL + "?github_callback=1" }
  });
  if (error) return err(error.message);
  return Response.redirect(data.url, 302);
});
