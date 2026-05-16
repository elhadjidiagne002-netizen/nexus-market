import { adminClient, requireAuth } from "../../_lib/supabase.js";
import { handle, ok, err } from "../../_lib/response.js";

export const onRequest = handle(async ({ request, env }) => {
  if (request.method !== "POST") return err("Méthode non autorisée", 405);
  const { user } = await requireAuth(env, request);
  const { amount, orderId, currency = "xof" } = await request.json();
  if (!amount || !orderId) return err("amount et orderId requis");

  const STRIPE_SECRET = env.STRIPE_SECRET_KEY;
  if (!STRIPE_SECRET) return err("Stripe non configuré", 503);

  const body = new URLSearchParams({
    amount: String(Math.round(amount)),
    currency,
    "metadata[orderId]": orderId,
    "metadata[userId]": user.id,
    automatic_payment_methods_enabled: "true"
  });

  const res = await fetch("https://api.stripe.com/v1/payment_intents", {
    method: "POST",
    headers: {
      "Authorization": "Bearer " + STRIPE_SECRET,
      "Content-Type":  "application/x-www-form-urlencoded"
    },
    body
  });

  const pi = await res.json();
  if (!res.ok) return err(pi.error?.message || "Erreur Stripe", 502);

  const sb = adminClient(env);
  await sb.from("orders").update({ stripe_payment_intent: pi.id }).eq("id", orderId);

  return ok({ clientSecret: pi.client_secret, paymentIntentId: pi.id });
});
