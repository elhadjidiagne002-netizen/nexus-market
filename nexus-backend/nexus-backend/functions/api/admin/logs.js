import { adminClient, requireRole } from "../_lib/supabase.js";
import { handle, ok, err } from "../_lib/response.js";

export const onRequest = handle(async ({ request, env }) => {
  await requireRole(env, request, ["admin"]);
  const sb = adminClient(env);
  const url = new URL(request.url);
  const page    = parseInt(url.searchParams.get("page")   || "1");
  const limit   = parseInt(url.searchParams.get("limit")  || "50");
  const action  = url.searchParams.get("action");
  const userId  = url.searchParams.get("user_id");

  let q = sb.from("activity_logs").select("*, profiles!user_id(name,email)", { count: "exact" }).order("created_at", { ascending: false }).range((page-1)*limit, page*limit-1);
  if (action) q = q.eq("action", action);
  if (userId) q = q.eq("user_id", userId);

  const { data, count, error } = await q;
  if (error) return err(error.message);
  return ok({ logs: data, total: count, page, limit });
});
