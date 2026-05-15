// POST /api/payouts/process/:id  { action: "approve"|"reject"|"mark_paid", adminNote? }
import { requireRole, jsonOk, jsonErr, sbPatch, logAdminAction } from "../../../../_lib/auth.js";

export async function onRequestPost(context) {
  const { request, env, params } = context;
  const { user, error } = await requireRole(request, env, ["admin"]);
  if (error) return error;

  const payoutId = params.id;
  if (!payoutId) return jsonErr("id requis", 400);

  let body;
  try { body = await request.json(); } catch { return jsonErr("JSON invalide", 400); }

  const { action, adminNote } = body || {};
  const ACTION_MAP = {
    approve:   "approved",
    reject:    "rejected",
    mark_paid: "paid",
  };

  if (!ACTION_MAP[action]) {
    return jsonErr(`Action invalide. Valeurs : ${Object.keys(ACTION_MAP).join(", ")}`, 400);
  }

  const newStatus = ACTION_MAP[action];
  const updates = {
    status:       newStatus,
    admin_note:   adminNote || null,
    updated_at:   new Date().toISOString(),
    ...(newStatus === "paid" ? { processed_at: new Date().toISOString() } : {}),
  };

  const res = await sbPatch(env, "payout_requests",
    `id=eq.${encodeURIComponent(payoutId)}`, updates);
  if (!res?.ok) return jsonErr("Erreur Supabase", 502);

  const rows = await res.json().catch(() => []);
  const updated = rows[0] || {};

  await logAdminAction(env, user.id, `payout_${action}`, "payout", payoutId,
    { status: newStatus, adminNote });

  return jsonOk({ ok: true, payoutId, status: newStatus, payout: updated });
}
