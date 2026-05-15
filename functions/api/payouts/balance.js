// GET /api/payouts/balance
// Retourne le solde disponible du vendeur authentifié.
import { requireRole, jsonOk, jsonErr, sbSelect } from "../../_lib/auth.js";

export async function onRequestGet(context) {
  const { request, env } = context;
  const { user, error } = await requireRole(request, env, ["vendor", "admin"]);
  if (error) return error;

  const vendorId = user.id;

  const [cashbacks, pendingPayouts, paidPayouts] = await Promise.all([
    sbSelect(env, "cashback_transactions", `user_id=eq.${vendorId}&select=amount_xof,type`),
    sbSelect(env, "payout_requests",
      `vendor_id=eq.${vendorId}&status=in.(pending,approved,processing)&select=amount`),
    sbSelect(env, "payout_requests",
      `vendor_id=eq.${vendorId}&status=eq.paid&select=amount`),
  ]);

  const cashBalance = (cashbacks || []).reduce((s, t) =>
    (t.type === "earn" || t.type === "bonus") ? s + (t.amount_xof || 0) : s - (t.amount_xof || 0), 0);
  const pendingXof  = (pendingPayouts || []).reduce((s, p) => s + (p.amount || 0), 0);
  const paidXof     = (paidPayouts || []).reduce((s, p) => s + (p.amount || 0), 0);
  const available   = Math.max(0, cashBalance - pendingXof - paidXof);

  return jsonOk({
    available_xof: Math.round(available),
    pending_xof:   Math.round(pendingXof),
    paid_xof:      Math.round(paidXof),
    total_xof:     Math.round(cashBalance),
  });
}
