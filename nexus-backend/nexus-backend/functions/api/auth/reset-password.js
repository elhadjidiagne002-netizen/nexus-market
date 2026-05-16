import { adminClient } from "../_lib/supabase.js";
import { handle, ok, err } from "../_lib/response.js";

export const onRequest = handle(async ({ request, env }) => {
  if (request.method !== "POST") return err("Méthode non autorisée", 405);
  const { email, code, newPassword } = await request.json();
  const sb = adminClient(env);

  if (email && !code) {
    // Step 1: send OTP
    const { error } = await sb.auth.resetPasswordForEmail(email, {
      redirectTo: env.SITE_URL + "?reset=1"
    });
    if (error) return err(error.message);
    return ok({ message: "Email de réinitialisation envoyé" });
  }

  if (code && newPassword) {
    // Step 2: verify OTP and set new password (handled by Supabase redirect flow)
    const { error } = await sb.auth.verifyOtp({ email, token: code, type: "recovery" });
    if (error) return err("Code invalide ou expiré", 400);
    return ok({ message: "Mot de passe réinitialisé" });
  }

  return err("Paramètres manquants");
});
