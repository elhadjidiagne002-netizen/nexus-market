// PATCH /api/admin/users/:id/ban  { ban: bool }
import { requireRole, jsonOk, jsonErr, sbPatch, logAdminAction } from "../../../../_lib/auth.js";

export async function onRequestPatch(context) {
  const { request, env, params } = context;
  const { user, error } = await requireRole(request, env, ["admin"]);
  if (error) return error;

  const uid = params.id;
  if (!uid) return jsonErr("id requis", 400);

  let body;
  try { body = await request.json(); } catch { return jsonErr("JSON invalide", 400); }
  const ban = body?.ban !== false; // default: ban

  const res = await sbPatch(env, "profiles", `id=eq.${uid}`, {
    status:     ban ? "banned" : "active",
    updated_at: new Date().toISOString(),
  });
  if (!res?.ok) return jsonErr("Erreur Supabase", 502);

  await logAdminAction(env, user.id, ban ? "ban_user" : "unban_user", "user", uid, { ban });
  return jsonOk({ ok: true, uid, banned: ban });
}
