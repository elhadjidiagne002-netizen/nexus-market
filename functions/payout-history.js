/**
 * functions/payout-history.js
 * GET /payout-history → solde disponible + historique des retraits
 */
import { createClient } from "@supabase/supabase-js";

export async function onRequestGet(context) {
  const { request, env } = context;

  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
  const json = (status, body) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json", ...cors },
    });

  if (!env.SUPABASE_SERVICE_KEY) {
    return json(503, { error: "Config manquante" });
  }

  const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Auth
  const auth = request.headers.get("Authorization") || "";
  if (!auth.startsWith("Bearer ")) return json(401, { error: "Token manquant" });

  const { data: { user }, error: authErr } = await sb.auth.getUser(auth.slice(7));
  if (authErr || !user) return json(401, { error: "Token invalide" });

  const commissionRate = parseFloat(env.NEXUS_COMMISSION || "0.15");
  const eurToXof = parseFloat(env.EUR_TO_XOF || "655.957");

  // [FIX] La colonne du vendeur est vendor_id dans le schéma orders
  // (et non vendor — cf. saveOrder dans index.html).
  const { data: orders, error: ordErr } = await sb
    .from("orders")
    .select("total, commission")
    .eq("vendor_id", user.id)
    .eq("status", "delivered");

  if (ordErr) return json(500, { error: ordErr.message });

  const grossXof = (orders || []).reduce((s, o) => s + Math.round((o.total || 0) * eurToXof), 0);
  const commXof = (orders || []).reduce((s, o) => {
    const comm = o.commission != null ? o.commission : (o.total || 0) * commissionRate;
    return s + Math.round(comm * eurToXof);
  }, 0);
  const netXof = grossXof - commXof;

  const { data: payouts, error: payErr } = await sb
    .from("payout_requests")
    .select("id, amount_xof, method, provider, destination, status, ref_command, created_at, paid_at, failed_at")
    .eq("vendor_id", user.id)
    .order("created_at", { ascending: false });

  if (payErr) return json(500, { error: payErr.message });

  const usedXof = (payouts || [])
    .filter(p => ["pending", "processing", "paid"].includes(p.status))
    .reduce((s, p) => s + (p.amount_xof || 0), 0);
  const availableXof = Math.max(0, netXof - usedXof);

  return json(200, {
    wallet: {
      gross_xof: grossXof,
      commission_xof: commXof,
      net_xof: netXof,
      pending_xof: (payouts || []).filter(p => ["pending", "processing"].includes(p.status)).reduce((s, p) => s + p.amount_xof, 0),
      paid_xof: (payouts || []).filter(p => p.status === "paid").reduce((s, p) => s + p.amount_xof, 0),
      available_xof: availableXof,
    },
    payouts: payouts || [],
  });
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}
