import { adminClient, requireAuth } from "../_lib/supabase.js";
import { handle, ok, err } from "../_lib/response.js";

export const onRequest = handle(async ({ request, env }) => {
  const { user } = await requireAuth(env, request);
  const sb = adminClient(env);
  const url = new URL(request.url);
  const page  = parseInt(url.searchParams.get("page")  || "1");
  const limit = parseInt(url.searchParams.get("limit") || "20");
  const month = url.searchParams.get("month");

  let q = sb.from("orders").select("*", { count: "exact" }).eq("buyer_id", user.id).eq("is_b2b", true).order("created_at", { ascending: false }).range((page-1)*limit, page*limit - 1);
  if (month) q = q.gte("created_at", month + "-01").lt("created_at", month + "-32");

  const { data, count, error } = await q;
  if (error) return err(error.message);
  return ok({ orders: data, total: count, page, limit });
});
