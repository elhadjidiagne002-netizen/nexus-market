import { adminClient, requireAuth } from "../_lib/supabase.js";
import { handle, ok, err } from "../_lib/response.js";

export const onRequest = handle(async ({ request, env }) => {
  if (request.method !== "POST") return err("Méthode non autorisée", 405);
  const { user } = await requireAuth(env, request);
  const { current, newPw } = await request.json();
  if (!newPw || newPw.length < 8) return err("Mot de passe trop court (min 8 caractères)");

  const sb = adminClient(env);
  // Verify current password
  const { error: loginErr } = await sb.auth.signInWithPassword({ email: user.email, password: current });
  if (loginErr) return err("Mot de passe actuel incorrect", 401);

  const { error } = await sb.auth.admin.updateUserById(user.id, { password: newPw });
  if (error) return err(error.message);
  return ok({ message: "Mot de passe modifié" });
});
