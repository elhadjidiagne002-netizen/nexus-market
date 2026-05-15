// ── POST /api/auth/logout ──────────────────────────────────────────────────
// Révoque la session Supabase côté serveur (invalidation du refresh token).
import { resolveUser, jsonOk } from "../../../_lib/auth.js";

export async function onRequestPost(context) {
  const { request, env } = context;

  const jwt = (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!jwt) return jsonOk({ ok: true }); // déjà déconnecté

  const { SUPABASE_URL: url, SUPABASE_SERVICE_KEY: key } = env;

  // Révoquer toutes les sessions de cet utilisateur
  const user = await resolveUser(request, env);
  if (user?.id) {
    await fetch(`${url}/auth/v1/admin/users/${user.id}/logout`, {
      method:  "POST",
      headers: { "apikey": key, "Authorization": `Bearer ${key}` },
    }).catch(() => {});
  }

  return jsonOk({ ok: true });
}
