import { adminClient, requireAuth } from "../_lib/supabase.js";
import { handle, ok, err } from "../_lib/response.js";

export const onRequest = handle(async ({ request, env }) => {
  const { user } = await requireAuth(env, request);
  const sb = adminClient(env);
  const { data: orders } = await sb.from("orders").select("total,commission_rate").eq("vendor_id", user.id).eq("status", "delivered").eq("paid_out", false);
  const { data: pending } = await sb.from("payout_requests").select("amount").eq("vendor_id", user.id).in("status", ["pending","processing"]);
  const gross   = (orders  || []).reduce((s, o) => s + o.total, 0);
  const net     = (orders  || []).reduce((s, o) => s + o.total * (1 - (o.commission_rate || 0.15)), 0);
  const pending_amount = (pending || []).reduce((s, p) => s + p.amount, 0);
  return ok({ gross, net, pending: pending_amount, available: Math.max(0, net - pending_amount) });
});
