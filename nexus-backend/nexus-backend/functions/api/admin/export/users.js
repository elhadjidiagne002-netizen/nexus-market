import { adminClient, requireRole } from "../../_lib/supabase.js";
import { handle, err } from "../../_lib/response.js";
import { CORS } from "../../_lib/response.js";

export const onRequest = handle(async ({ request, env }) => {
  await requireRole(env, request, ["admin"]);
  const sb = adminClient(env);
  const { data } = await sb.from("profiles").select("id,name,email,role,phone,created_at,status,banned").order("created_at", { ascending: false });
  const headers = ["id","name","email","role","phone","created_at","status","banned"];
  const rows = (data||[]).map(u => headers.map(h => JSON.stringify(u[h]||"")).join(","));
  const csv = [headers.join(","), ...rows].join("
");
  return new Response(csv, { headers: { ...CORS, "Content-Type": "text/csv", "Content-Disposition": "attachment; filename=nexus_users.csv" } });
});
