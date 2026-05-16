import { adminClient, requireAuth } from "../../_lib/supabase.js";
import { handle, ok, err } from "../../_lib/response.js";

export const onRequest = handle(async ({ request, env }) => {
  if (request.method !== "POST") return err("Méthode non autorisée", 405);
  const { user } = await requireAuth(env, request);
  const { role } = await request.json();
  if (!["buyer", "vendor", "buyer_pro"].includes(role)) return err("Rôle invalide");
  const sb = adminClient(env);
  await sb.auth.admin.updateUserById(user.id, { user_metadata: { role } });
  await sb.from("profiles").upsert({ id: user.id, role });
  return ok({ message: "Rôle assigné", role });
});
