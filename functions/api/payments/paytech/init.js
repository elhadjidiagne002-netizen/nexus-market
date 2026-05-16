import { adminClient, requireAuth } from "../../_lib/supabase.js";
import { handle, ok, err } from "../../_lib/response.js";

export const onRequest = handle(async ({ request, env }) => {
  if (request.method !== "POST") return err("Méthode non autorisée", 405);
  const { user } = await requireAuth(env, request);
  const { orderId, amount, phone, operator } = await request.json();
  if (!orderId || !amount || !phone) return err("orderId, amount et phone requis");

  const PAYTECH_API_KEY    = env.PAYTECH_API_KEY;
  const PAYTECH_SECRET_KEY = env.PAYTECH_SECRET_KEY;
  if (!PAYTECH_API_KEY) return err("PayTech non configuré", 503);

  const payload = {
    item_name:    "Commande NEXUS #" + orderId,
    item_price:   Math.round(amount),
    currency:     "XOF",
    ref_command:  orderId,
    command_name: "Paiement Mobile Money " + operator?.toUpperCase(),
    env:          env.PAYTECH_ENV || "test",
    ipn_url:      env.SITE_URL + "/api/payments/paytech/ipn",
    success_url:  env.SITE_URL + "?payment=success&order=" + orderId,
    cancel_url:   env.SITE_URL + "?payment=cancel&order=" + orderId,
    custom_field: JSON.stringify({ orderId, userId: user.id, phone, operator })
  };

  const res = await fetch("https://paytech.sn/api/payment/request-payment", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "API_KEY": PAYTECH_API_KEY,
      "API_SECRET": PAYTECH_SECRET_KEY
    },
    body: JSON.stringify(payload)
  });

  const data = await res.json();
  if (!res.ok || data.success !== 1) return err(data.message || "Erreur PayTech", 502);

  // Save token in order
  const sb = adminClient(env);
  await sb.from("orders").update({ paytech_token: data.token, status: "pending_payment" }).eq("id", orderId);

  return ok({ redirectUrl: data.redirect_url || data.redirectUrl, token: data.token });
});
