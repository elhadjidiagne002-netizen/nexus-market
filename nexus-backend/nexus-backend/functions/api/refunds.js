import { adminClient, requireRole } from "./_lib/supabase.js";
import { handle, ok, err } from "./_lib/response.js";

export const onRequest = handle(async ({ request, env }) => {
  if (request.method !== "POST") return err("Méthode non autorisée", 405);
  const { user } = await requireRole(env, request, ["admin"]);
  const { orderId, amount, reason, note } = await request.json();
  if (!orderId) return err("orderId requis");

  const sb = adminClient(env);
  const { data: order } = await sb.from("orders").select("*").eq("id", orderId).single();
  if (!order) return err("Commande introuvable", 404);

  const refundAmount = amount || order.total;

  // Attempt Stripe refund if applicable
  if (order.stripe_payment_id && env.STRIPE_SECRET_KEY) {
    const body = new URLSearchParams({ payment_intent: order.stripe_payment_id, amount: String(Math.round(refundAmount)) });
    await fetch("https://api.stripe.com/v1/refunds", {
      method: "POST",
      headers: { "Authorization": "Bearer " + env.STRIPE_SECRET_KEY, "Content-Type": "application/x-www-form-urlencoded" },
      body
    }).catch(() => {});
  }

  await sb.from("orders").update({ status: "cancelled", refunded: true, refund_amount: refundAmount, refund_reason: reason, refund_note: note, refunded_at: new Date().toISOString() }).eq("id", orderId);
  await sb.from("refunds").insert({ order_id: orderId, admin_id: user.id, amount: refundAmount, reason, note });

  return ok({ refunded: true, amount: refundAmount });
});
