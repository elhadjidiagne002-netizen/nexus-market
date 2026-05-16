import { adminClient, requireAuth } from "../../../_lib/supabase.js";
import { handle, ok, err } from "../../../_lib/response.js";

export const onRequest = handle(async ({ request, env, params }) => {
  const { user } = await requireAuth(env, request);
  const orderId = params.orderId;
  const sb = adminClient(env);
  const { data, error } = await sb.from("orders").select("id,status,paytech_token,paid_at").eq("id", orderId).single();
  if (error) return err("Commande introuvable", 404);
  return ok({ paid: ["processing","in_transit","delivered"].includes(data?.status), order: data });
});
