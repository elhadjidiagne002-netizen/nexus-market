// functions/api/auth/login.js
// Connexion email/password via Supabase Auth
// Retourne le token dans le format attendu par le frontend (json.accessToken)
import { adminClient } from "../_lib/supabase.js";
import { handle, ok, err } from "../_lib/response.js";

export const onRequest = handle(async ({ request, env }) => {
  if (request.method !== "POST") return err("Methode non autorisee", 405);

  const body = await request.json().catch(() => ({}));
  const { email, password } = body;
  if (!email || !password) return err("Email et mot de passe requis", 400);

  const sb = adminClient(env);
  const { data, error } = await sb.auth.signInWithPassword({
    email:    email.trim().toLowerCase(),
    password,
  });

  if (error) {
    const msg  = error.message || "";
    const code = error.code    || "";
    if (msg.includes("Invalid login") || code === "invalid_credentials")
      return err("Email ou mot de passe incorrect", 401);
    if (msg.includes("Email not confirmed") || code === "email_not_confirmed")
      return err("Email non confirme. Verifiez votre boite mail.", 401);
    if (msg.includes("Too many requests") || code === "over_email_send_rate_limit")
      return err("Trop de tentatives. Attendez quelques minutes.", 429);
    return err(msg || "Erreur d'authentification", 401);
  }

  // Recuperer le profil depuis la table profiles
  const { data: profile } = await sb
    .from("profiles")
    .select("id,name,email,role,avatar,status,phone,address")
    .eq("id", data.user.id)
    .single()
    .catch(() => ({ data: null }));

  const meta = data.user.user_metadata || {};
  const user = {
    id:      data.user.id,
    email:   data.user.email,
    name:    profile?.name   || meta.name   || data.user.email.split("@")[0],
    role:    profile?.role   || meta.role   || "buyer",
    avatar:  profile?.avatar || meta.avatar || (profile?.name || meta.name || data.user.email).slice(0,2).toUpperCase(),
    status:  profile?.status || "active",
    phone:   profile?.phone  || meta.phone  || null,
    address: profile?.address || null,
  };

  // IMPORTANT: retourner accessToken et token au niveau racine
  // Le frontend DataService._saveTokens() cherche json.accessToken || json.token
  // json.supabase_user = true declenche this._sb.auth.signInWithPassword() dans le frontend
  // → cree une session Supabase SDK pour que getSession() fonctionne ensuite
  return ok({
    accessToken:   data.session.access_token,
    token:         data.session.access_token,
    refreshToken:  data.session.refresh_token,
    expiresIn:     data.session.expires_in || 3600,
    supabase_user: true,
    user,
    session:       data.session,
  });
});