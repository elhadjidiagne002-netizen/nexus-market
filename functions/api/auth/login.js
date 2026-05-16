import { adminClient } from "../_lib/supabase.js";
import { handle, ok, err } from "../_lib/response.js";

export const onRequest = handle(async ({ request, env }) => {
  if (request.method !== "POST") return err("Méthode non autorisée", 405);
  const { email, password } = await request.json();
  if (!email || !password) return err("Email et mot de passe requis");

  const sb = adminClient(env);
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) return err(error.message, 401);

  const { data: profile } = await sb.from("profiles").select("*").eq("id", data.user.id).single();
  return ok({
    user: { ...data.user, ...profile },
    session: data.session
  });
});
