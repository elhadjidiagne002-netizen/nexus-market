import { adminClient, requireAuth } from "../../../_lib/supabase.js";
import { handle, ok, err } from "../../../_lib/response.js";

export const onRequest = handle(async ({ request, env, params }) => {
  const { user } = await requireAuth(env, request);
  const orderId = params.orderId;
  const sb = adminClient(env);
  // [FIX] Colonnes conformes au schéma orders (paytech_token/paid_at n'existent pas).
  const { data, error } = await sb.from("orders").select("id,status,payment_status,mobile_money_ref,total").eq("id", orderId).single();
  if (error) return err("Commande introuvable", 404);
  return ok({ paid: data?.payment_status === "paid", failed: data?.payment_status === "failed", order: data });
});
