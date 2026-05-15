// PATCH /api/orders/:id/status  { status: "processing"|"in_transit"|"delivered"|"cancelled" }
import { requireRole, jsonOk, jsonErr, sbPatch, logAdminAction } from "../../../../_lib/auth.js";

const VALID_STATUSES = ["processing", "in_transit", "delivered", "cancelled", "paid", "failed"];

export async function onRequestPatch(context) {
  const { request, env, params } = context;
  const { user, error } = await requireRole(request, env, ["admin", "vendor"]);
  if (error) return error;

  const orderId = params.id;
  if (!orderId) return jsonErr("id requis", 400);

  let body;
  try { body = await request.json(); } catch { return jsonErr("JSON invalide", 400); }

  const { status, trackingNumber } = body || {};
  if (!status || !VALID_STATUSES.includes(status)) {
    return jsonErr(`Statut invalide. Valeurs : ${VALID_STATUSES.join(", ")}`, 400);
  }

  const updates = {
    status,
    updated_at: new Date().toISOString(),
    ...(status === "delivered" ? { paid_at: new Date().toISOString() } : {}),
    ...(trackingNumber ? { tracking_number: trackingNumber } : {}),
  };

  const res = await sbPatch(env, "orders", `id=eq.${encodeURIComponent(orderId)}`, updates);
  if (!res?.ok) return jsonErr("Erreur Supabase", 502);

  await logAdminAction(env, user.id, "update_order_status", "order", orderId,
                       { status, role: user.role });
  return jsonOk({ ok: true, orderId, status });
}
