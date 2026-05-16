import { adminClient } from "../_lib/supabase.js";
import { handle, ok, err } from "../_lib/response.js";

export const onRequest = handle(async ({ request, env }) => {
  if (request.method !== "POST") return err("Méthode non autorisée", 405);
  const { email } = await request.json();
  if (!email) return err("Email requis");
  const sb = adminClient(env);
  await sb.auth.resend({ type: "signup", email }).catch(() => {});
  return ok({ message: "Email de confirmation renvoyé" });
});
