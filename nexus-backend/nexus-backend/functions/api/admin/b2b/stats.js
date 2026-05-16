import { adminClient, requireRole } from "../../_lib/supabase.js";
import { handle, ok, err } from "../../_lib/response.js";

export const onRequest = handle(async ({ request, env }) => {
  await requireRole(env, request, ["admin"]);
  const sb = adminClient(env);
  const { count: total }    = await sb.from("b2b_profiles").select("id", { count: "exact" });
  const { count: verified } = await sb.from("b2b_profiles").select("id", { count: "exact" }).eq("verified", true);
  const { data: orders }    = await sb.from("orders").select("total").eq("is_b2b", true);
  const revenue = (orders||[]).reduce((s,o) => s+o.total, 0);
  return ok({ total: total||0, verified: verified||0, revenue });
});
