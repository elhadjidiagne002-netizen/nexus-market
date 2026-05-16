import { adminClient, requireRole } from "../_lib/supabase.js";
import { handle, ok, err } from "../_lib/response.js";

export const onRequest = handle(async ({ request, env }) => {
  await requireRole(env, request, ["admin"]);
  const sb = adminClient(env);
  const url = new URL(request.url);
  const page  = parseInt(url.searchParams.get("page")  || "1");
  const limit = parseInt(url.searchParams.get("limit") || "50");
  const { data, error } = await sb
    .from("admin_logs")
    .select("*")
    .order("created_at", { ascending: false })
    .range((page-1)*limit, page*limit-1);
  if (error) return err(error.message);
  return ok({ logs: data || [], page, limit });
});