import { adminClient, requireAuth } from "../_lib/supabase.js";
import { handle, ok, err } from "../_lib/response.js";

export const onRequest = handle(async ({ request, env }) => {
  if (request.method !== "POST") return err("Méthode non autorisée", 405);
  const { user } = await requireAuth(env, request);
  const { amount, phone, provider } = await request.json();
  if (!amount || amount < 2000) return err("Montant minimum 2 000 FCFA");
  if (!phone) return err("Numéro de téléphone requis");

  const sb = adminClient(env);

  // Check available cashback
  const { data: txs } = await sb.from("cashback_transactions").select("amount_fcfa,status").eq("user_id", user.id);
  const available = (txs||[]).reduce((s,t) => {
    if (t.status === "credited" || t.status === "pending") return s + (t.amount_fcfa||0);
    if (t.status === "withdrawn") return s - (t.amount_fcfa||0);
    return s;
  }, 0);

  if (amount > available) return err(`Cashback insuffisant. Disponible : ${Math.round(available).toLocaleString("fr-FR")} FCFA`);

  // Create payout request
  const { data: payout, error } = await sb.from("payout_requests").insert({
    vendor_id: user.id, amount, method: "mobile", phone, provider: provider || "orange",
    status: "pending"
  }).select().single();
  if (error) return err(error.message);

  // Mark cashback as withdrawn
  await sb.from("cashback_transactions").insert({
    user_id: user.id, amount_fcfa: amount, amount_fcfa_field: amount,
    transaction_type: "redeem", status: "withdrawn",
    description: `Retrait cashback ambassadeur #${payout.id.slice(-8)}`
  });

  return ok({ success: true, payout, available_after: Math.max(0, available - amount) }, 201);
});
