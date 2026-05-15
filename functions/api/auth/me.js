// ── /api/auth/me ──────────────────────────────────────────────────────────────
// GET  → profil de l'utilisateur connecté (depuis profiles + auth.users)
// Cloudflare Pages Function.
import { resolveUser, jsonOk, jsonErr, sbSelect } from "../../_lib/auth.js";

export async function onRequestGet(context) {
  const { request, env } = context;
  const user = await resolveUser(request, env);
  if (!user) return jsonErr("Non authentifié", 401);

  const profiles = await sbSelect(env, "profiles",
    `id=eq.${user.id}&select=*`);
  const profile = (Array.isArray(profiles) ? profiles[0] : null) || {};

  return jsonOk({
    id:        user.id,
    email:     user.email,
    role:      profile.role      || "buyer",
    status:    profile.status    || "active",
    name:      profile.name      || user.email?.split("@")[0],
    avatar:    profile.avatar    || profile.avatar_url || null,
    shopName:  profile.shop_name || null,
    phone:     profile.phone     || null,
  });
}
