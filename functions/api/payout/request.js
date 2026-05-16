import { adminClient, requireRole } from "../_lib/supabase.js";
import { handle, ok, err } from "../_lib/response.js";

export const onRequest = handle(async ({ request, env }) => {
  if (request.method !== "POST") return err("Méthode non autorisée", 405);
  const { user } = await requireRole(env, request, ["vendor","admin"]);
  const { amount, method, phone, provider, iban } = await request.json();
  if (!amount || amount < 1000) return err("Montant minimum 1 000 FCFA");

  const sb = adminClient(env);

  // Check available balance
  const { data: orders } = await sb.from("orders").select("total").eq("vendor_id", user.id).eq("status", "delivered").eq("paid_out", false);
  const balance = (orders || []).reduce((s, o) => s + (o.total * 0.85), 0); // 15% commission
  if (amount > balance) return err("Solde insuffisant (disponible: " + Math.round(balance) + " FCFA)");

  const { data, error } = await sb.from("payout_requests").insert({
    vendor_id: user.id, amount, method, phone, provider, iban, status: "pending"
  }).select().single();
  if (error) return err(error.message);

  // Call PayTech payout API if configured
  const PAYTECH_API_KEY = env.PAYTECH_API_KEY;
  let paytech_ok = false;
  if (PAYTECH_API_KEY && method === "mobile") {
    const res = await fetch("https://paytech.sn/api/payout/create", {
      method: "POST",
      headers: { "API_KEY": PAYTECH_API_KEY, "API_SECRET": env.PAYTECH_SECRET_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ phone, amount, currency: "XOF", description: "Retrait vendeur NEXUS #" + data.id })
    }).catch(() => null);
    if (res?.ok) {
      const r = await res.json();
      paytech_ok = r.success === 1;
      await sb.from("payout_requests").update({ paytech_ref: r.ref, status: paytech_ok ? "processing" : "pending" }).eq("id", data.id);
    }
  }

  return ok({ ...data, paytech_ok }, 201);
});
