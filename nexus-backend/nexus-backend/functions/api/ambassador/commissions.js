import { adminClient, requireAuth } from "../_lib/supabase.js";
import { handle, ok, err } from "../_lib/response.js";

export const onRequest = handle(async ({ request, env }) => {
  const { user } = await requireAuth(env, request);
  const sb = adminClient(env);
  const url = new URL(request.url);
  const page  = parseInt(url.searchParams.get("page")  || "1");
  const limit = parseInt(url.searchParams.get("limit") || "20");

  const { data: amb } = await sb.from("ambassadors").select("id,total_earned,commission_rate").eq("user_id", user.id).single();
  if (!amb) return ok({ commissions: [], total: 0, total_earned: 0 });

  const { data, count, error } = await sb.from("ambassador_referrals")
    .select("*, orders!order_id(id,total,status,created_at,products)", { count: "exact" })
    .eq("ambassador_id", amb.id)
    .in("status", ["confirmed","paid"])
    .order("created_at", { ascending: false })
    .range((page-1)*limit, page*limit-1);

  if (error) return err(error.message);

  const cashbackHistory = await sb.from("cashback_transactions")
    .select("*").eq("user_id", user.id).eq("transaction_type","earn")
    .order("created_at", { ascending: false });

  return ok({
    commissions:   data || [],
    cashback_history: cashbackHistory.data || [],
    total:         count || 0,
    total_earned:  amb.total_earned,
    commission_rate: amb.commission_rate,
    page, limit
  });
});
