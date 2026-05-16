import { adminClient, requireAuth } from "./_lib/supabase.js";
import { handle, ok, err } from "./_lib/response.js";

export const onRequest = handle(async ({ request, env }) => {
  const { user } = await requireAuth(env, request);
  const sb = adminClient(env);
  const url = new URL(request.url);
  const type = url.searchParams.get("type"); // "vendor" or "buyer"

  let q = sb.from("orders").select("id,created_at,total,status,products,vendor_id,buyer_id,customer_info,invoice_number").eq("status", "delivered");
  if (type === "vendor") q = q.eq("vendor_id", user.id);
  else q = q.eq("buyer_id", user.id);
  q = q.order("created_at", { ascending: false });

  const { data, error } = await q;
  if (error) return err(error.message);
  return ok(data);
});
