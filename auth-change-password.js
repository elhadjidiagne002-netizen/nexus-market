// ── POST /api/auth/change-password  { currentPassword, newPassword } ──────
// Change le mot de passe via Supabase Admin API (vérifie d'abord l'ancien).
import { resolveUser, jsonOk, jsonErr } from "../../../_lib/auth.js";

export async function onRequestPost(context) {
  const { request, env } = context;
  const user = await resolveUser(request, env);
  if (!user) return jsonErr("Non authentifié", 401);

  let body;
  try { body = await request.json(); } catch { return jsonErr("JSON invalide", 400); }
  const { currentPassword, newPassword } = body || {};
  if (!newPassword || newPassword.length < 8) {
    return jsonErr("Le nouveau mot de passe doit contenir au moins 8 caractères", 400);
  }

  const { SUPABASE_URL: url, SUPABASE_SERVICE_KEY: key } = env;

  // Vérifier l'ancien mot de passe via signInWithPassword
  if (currentPassword) {
    const checkRes = await fetch(`${url}/auth/v1/token?grant_type=password`, {
      method:  "POST",
      headers: { "apikey": key, "Content-Type": "application/json" },
      body:    JSON.stringify({ email: user.email, password: currentPassword }),
    }).catch(() => null);

    if (!checkRes?.ok) {
      return jsonErr("Mot de passe actuel incorrect", 401);
    }
  }

  // Mettre à jour le mot de passe via Admin API
  const updateRes = await fetch(`${url}/auth/v1/admin/users/${user.id}`, {
    method:  "PUT",
    headers: {
      "Content-Type":  "application/json",
      "apikey":        key,
      "Authorization": `Bearer ${key}`,
    },
    body: JSON.stringify({ password: newPassword }),
  }).catch(() => null);

  if (!updateRes?.ok) {
    const err = await updateRes?.text().catch(() => "");
    return jsonErr(`Erreur Supabase : ${err}`, 502);
  }

  return jsonOk({ ok: true, message: "Mot de passe modifié avec succès" });
}
