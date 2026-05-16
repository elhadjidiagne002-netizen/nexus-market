import { adminClient, requireRole } from "../../_lib/supabase.js";
import { handle, err } from "../../_lib/response.js";
import { CORS } from "../../_lib/response.js";

export const onRequest = handle(async ({ request, env }) => {
  await requireRole(env, request, ["admin"]);
  const sb = adminClient(env);
  const { data } = await sb.from("orders").select("*").order("created_at", { ascending: false });
  const headers = ["id","created_at","buyer_id","vendor_id","total","status","payment_method","customer_name","customer_email","shipping_address"];
  const rows = (data||[]).map(o => headers.map(h => JSON.stringify(o[h]||"")).join(","));
  const csv = [headers.join(","), ...rows].join("
");
  return new Response(csv, { headers: { ...CORS, "Content-Type": "text/csv", "Content-Disposition": "attachment; filename=nexus_orders.csv" } });
});
