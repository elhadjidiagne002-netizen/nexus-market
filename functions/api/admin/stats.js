import { adminClient, requireRole } from "../_lib/supabase.js";
import { handle, ok, err } from "../_lib/response.js";

export const onRequest = handle(async ({ request, env }) => {
  await requireRole(env, request, ["admin"]);
  const sb = adminClient(env);

  const [orders, products, users, vendors, disputes, returns, payouts, stockAlerts] = await Promise.all([
    sb.from("orders").select("id,total,status,created_at", { count: "exact" }),
    sb.from("products").select("id,moderated", { count: "exact" }),
    sb.from("profiles").select("id,role,created_at", { count: "exact" }),
    sb.from("pending_vendors").select("id,status", { count: "exact" }),
    sb.from("disputes").select("id,status", { count: "exact" }),
    sb.from("return_requests").select("id,status", { count: "exact" }),
    sb.from("payout_requests").select("id,status,amount", { count: "exact" }),
    sb.from("stock_alerts").select("id", { count: "exact" }),
  ]);

  const now = new Date();
  const monthAgo = new Date(now - 30*86400000).toISOString();
  const weekAgo  = new Date(now - 7*86400000).toISOString();

  const allOrders    = orders.data || [];
  const revenue      = allOrders.filter(o => o.status !== "cancelled").reduce((s,o) => s+o.total, 0);
  const recentOrders = allOrders.filter(o => o.created_at >= monthAgo);
  const recentRev    = recentOrders.filter(o => o.status !== "cancelled").reduce((s,o) => s+o.total, 0);

  return ok({
    revenue,
    recentRevenue:   recentRev,
    totalOrders:     orders.count    || 0,
    totalProducts:   products.count  || 0,
    totalUsers:      users.count     || 0,
    pendingVendors:  (vendors.data||[]).filter(v => v.status === "pending").length,
    openDisputes:    (disputes.data||[]).filter(d => d.status === "open").length,
    pendingReturns:  (returns.data||[]).filter(r => r.status === "pending").length,
    pendingPayouts:  (payouts.data||[]).filter(p => p.status === "pending").length,
    stockAlerts:     stockAlerts.count || 0,
    newUsersWeek:    (users.data||[]).filter(u => u.created_at >= weekAgo).length,
  });
});
