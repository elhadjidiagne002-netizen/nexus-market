import { adminClient, requireRole } from "../../../../_lib/supabase.js";
import { handle, ok, err } from "../../../../_lib/response.js";

export const onRequest = handle(async ({ request, env, params }) => {
  if (request.method !== "POST") return err("Méthode non autorisée", 405);
  await requireRole(env, request, ["admin"]);
  const { vendorId } = params;
  const { approved, reason } = await request.json();
  const sb = adminClient(env);
  const status = approved ? "approved" : "rejected";
  await sb.from("pending_vendors").update({ status, rejection_reason: reason || null }).eq("user_id", vendorId);
  await sb.from("profiles").update({ status, vendor_status: status }).eq("id", vendorId);
  if (approved) await sb.auth.admin.updateUserById(vendorId, { user_metadata: { status: "approved" } }).catch(() => {});
  return ok({ status });
});
