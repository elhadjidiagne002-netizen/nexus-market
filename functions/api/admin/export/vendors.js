import { adminClient, requireRole } from "../../_lib/supabase.js";
import { handle, err } from "../../_lib/response.js";
import { CORS } from "../../_lib/response.js";

export const onRequest = handle(async ({ request, env }) => {
  await requireRole(env, request, ["admin"]);
  const sb = adminClient(env);
  const { data } = await sb.from("profiles").select("id,name,email,phone,shop_name,shop_category,ninea,rc,status,created_at").eq("role","vendor").order("created_at", { ascending: false });
  const headers = ["id","name","email","phone","shop_name","shop_category","ninea","rc","status","created_at"];
  const rows = (data||[]).map(v => headers.map(h => JSON.stringify(v[h]||"")).join(","));
  const csv = [headers.join(","), ...rows].join("
");
  return new Response(csv, { headers: { ...CORS, "Content-Type": "text/csv", "Content-Disposition": "attachment; filename=nexus_vendors.csv" } });
});
