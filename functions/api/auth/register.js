// functions/api/auth/register.js
// Inscription + creation du profil dans la table profiles
import { adminClient } from "../_lib/supabase.js";
import { handle, ok, err } from "../_lib/response.js";

export const onRequest = handle(async ({ request, env }) => {
  if (request.method !== "POST") return err("Methode non autorisee", 405);

  const body = await request.json().catch(() => ({}));
  const { email, password, name, role = "buyer", phone } = body;

  if (!email || !password || !name)
    return err("Email, mot de passe et nom requis", 400);
  if (password.length < 6)
    return err("Mot de passe minimum 6 caracteres", 400);

  const sb = adminClient(env);

  // Creer le compte Supabase Auth
  const { data, error } = await sb.auth.admin.createUser({
    email:    email.trim().toLowerCase(),
    password,
    email_confirm: true,
    user_metadata: { name, role, phone: phone || null },
  });

  if (error) {
    if (error.message?.includes("already registered") || error.message?.includes("already exists"))
      return err("Un compte existe deja avec cet email", 409);
    return err(error.message || "Erreur creation compte", 400);
  }

  // Creer ou mettre a jour le profil
  const avatar = name.slice(0, 2).toUpperCase();
  await sb.from("profiles").upsert({
    id:         data.user.id,
    email:      email.trim().toLowerCase(),
    name,
    role,
    avatar,
    phone:      phone || null,
    status:     "active",
    created_at: new Date().toISOString(),
  }, { onConflict: "id" }).catch(() => {});

  // Connecter directement (evite de redemander le mot de passe)
  const { data: session, error: loginError } = await sb.auth.signInWithPassword({
    email:    email.trim().toLowerCase(),
    password,
  });

  if (loginError || !session?.session) {
    return ok({
      message: "Compte cree. Connectez-vous.",
      user: { id: data.user.id, email: data.user.email, name, role, avatar },
    }, 201);
  }

  return ok({
    accessToken:   session.session.access_token,
    token:         session.session.access_token,
    refreshToken:  session.session.refresh_token,
    expiresIn:     session.session.expires_in || 3600,
    supabase_user: true,
    user: { id: data.user.id, email: data.user.email, name, role, avatar, status: "active" },
    session:       session.session,
  }, 201);
});