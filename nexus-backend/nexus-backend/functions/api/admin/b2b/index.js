import { adminClient, requireRole } from "../../_lib/supabase.js";
import { handle, ok, err } from "../../_lib/response.js";

export const onRequest = handle(async ({ request, env }) => {
  await requireRole(env, request, ["admin"]);
  const sb = adminClient(env);
  const url = new URL(request.url);
  const page   = parseInt(url.searchParams.get("page")   || "1");
  const limit  = parseInt(url.searchParams.get("limit")  || "50");
  const search = url.searchParams.get("search");

  let q = sb.from("b2b_profiles").select("*, profiles!user_id(name,email,phone)", { count: "exact" }).order("created_at", { ascending: false }).range((page-1)*limit, page*limit-1);
  if (search) q = q.or("company.ilike.%" + search + "%,ninea.ilike.%" + search + "%");
  const { data, count, error } = await q;
  if (error) return err(error.message);
  return ok({ profiles: data, total: count, page, limit });
});
