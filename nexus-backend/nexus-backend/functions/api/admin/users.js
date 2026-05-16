import { adminClient, requireRole } from "../_lib/supabase.js";
import { handle, ok, err } from "../_lib/response.js";

export const onRequest = handle(async ({ request, env }) => {
  await requireRole(env, request, ["admin"]);
  const sb = adminClient(env);
  const url = new URL(request.url);

  if (request.method === "GET") {
    const page   = parseInt(url.searchParams.get("page")  || "1");
    const limit  = parseInt(url.searchParams.get("limit") || "50");
    const role   = url.searchParams.get("role");
    const search = url.searchParams.get("search");

    let q = sb.from("profiles").select("*", { count: "exact" }).order("created_at", { ascending: false }).range((page-1)*limit, page*limit-1);
    if (role)   q = q.eq("role", role);
    if (search) q = q.or("name.ilike.%" + search + "%,email.ilike.%" + search + "%");

    const { data, count, error } = await q;
    if (error) return err(error.message);
    return ok({ users: data, total: count, page, limit });
  }

  if (request.method === "PATCH") {
    const uid = url.searchParams.get("id");
    const body = await request.json();
    const allowed = ["role","status","banned","ban_reason","discount_rate"];
    const update = Object.fromEntries(Object.entries(body).filter(([k]) => allowed.includes(k)));
    const { data, error } = await sb.from("profiles").update(update).eq("id", uid).select().single();
    if (error) return err(error.message);
    if (body.banned) await sb.auth.admin.updateUserById(uid, { ban_duration: "876600h" }).catch(() => {});
    return ok(data);
  }

  return err("Méthode non autorisée", 405);
});
