import { adminClient } from "../../_lib/supabase.js";
import { handle, ok, err } from "../../_lib/response.js";
import { createHmac } from "node:crypto";

export const onRequest = handle(async ({ request, env }) => {
  if (request.method !== "POST") return err("POST requis", 405);
  const body = await request.text();
  const params = new URLSearchParams(body);
  const token      = params.get("token");
  const typeEvent  = params.get("type_event");
  const customStr  = params.get("custom_field");

  // Verify signature
  const sig      = params.get("api_secret_sha256");
  const expected = createHmac("sha256", env.PAYTECH_SECRET_KEY).update(token + env.PAYTECH_API_KEY).digest("hex");
  if (sig !== expected) return err("Signature invalide", 403);

  if (typeEvent !== "sale_complete") return ok({ ignored: true });

  const custom = JSON.parse(customStr || "{}");
  const { orderId } = custom;

  const sb = adminClient(env);
  await sb.from("orders").update({ status: "processing", paid_at: new Date().toISOString(), payment_method: "paytech" }).eq("id", orderId);

  return ok({ received: true });
});
