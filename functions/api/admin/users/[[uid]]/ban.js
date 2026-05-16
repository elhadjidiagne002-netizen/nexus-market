import { adminClient, requireRole } from "../../../../_lib/supabase.js";
import { handle, ok, err } from "../../../../_lib/response.js";

export const onRequest = handle(async ({ request, env, params }) => {
  if (request.method !== "POST") return err("Méthode non autorisée", 405);
  await requireRole(env, request, ["admin"]);
  const { uid } = params;
  const { banned, reason } = await request.json();
  const sb = adminClient(env);
  await sb.from("profiles").update({ banned, ban_reason: reason || null }).eq("id", uid);
  if (banned) await sb.auth.admin.updateUserById(uid, { ban_duration: "876600h" }).catch(() => {});
  else await sb.auth.admin.updateUserById(uid, { ban_duration: "none" }).catch(() => {});
  return ok({ banned });
});
