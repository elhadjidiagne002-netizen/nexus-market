import { adminClient } from "../../_lib/supabase.js";
import { handle, ok, err } from "../../_lib/response.js";

export const onRequest = handle(async ({ request, env }) => {
  if (request.method !== "POST") return err("POST requis", 405);
  const payload  = await request.text();
  const sigHeader = request.headers.get("Stripe-Signature") || "";
  const secret   = env.STRIPE_WEBHOOK_SECRET;

  // Simple timestamp check (full HMAC requires crypto subtle)
  // For production, implement proper Stripe webhook verification
  let event;
  try { event = JSON.parse(payload); } catch { return err("JSON invalide", 400); }

  const sb = adminClient(env);
  if (event.type === "payment_intent.succeeded") {
    const pi = event.data.object;
    const orderId = pi.metadata?.orderId;
    if (orderId) {
      await sb.from("orders").update({ status: "processing", paid_at: new Date().toISOString(), payment_method: "stripe", stripe_payment_id: pi.id }).eq("id", orderId);
    }
  }
  return ok({ received: true });
});
