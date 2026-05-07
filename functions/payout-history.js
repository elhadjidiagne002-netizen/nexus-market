/**
 * functions/payout-history.js
 * ──────────────────────────────────────────────────────────────────────────
 * GET /payout-history → Solde disponible + historique des retraits du vendeur
 *
 * Variables d'environnement Cloudflare :
 *   SUPABASE_URL         — URL du projet Supabase
 *   SUPABASE_SERVICE_KEY — Clé service_role
 *   NEXUS_COMMISSION     — Commission (défaut : 0.15)
 *   EUR_TO_XOF           — Taux de change (défaut : 655.957)
 */

import { createClient } from "@supabase/supabase-js";

export async function onRequestGet(context) {
  const { request, env } = context;

  const json = (status, body) =>
    new Response(JSON.stringify(body), {
      status,
      headers: {
        "Content-Type":                 "application/json",
        "Access-Control-Allow-Origin":  "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
    });

  if (!env.SUPABASE_SERVICE_KEY) {
    return json(503, { error: "Config manquante" });
  }

  const NEXUS_COMMISSION = parseFloat(env.NEXUS_COMMISSION || "0.15");
  const EUR_TO_XOF       = parseFloat(env.EUR_TO_XOF       || "655.957");

  const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // ── Auth ──────────────────────────────────────────────────────────────────
  const authHeader = request.headers.get("authorization") || "";
  if (!authHeader.startsWith("Bearer ")) {
    return json(401, { error: "Token manquant" });
  }

  const { data: { user }, error: authErr } = await sb.auth.getUser(authHeader.slice(7));
  if (authErr || !user) {
    return json(401, { error: "Token invalide" });
  }

  // ── Commandes livrées ─────────────────────────────────────────────────────
  const { data: orders, error: ordErr } = await sb
    .from("orders")
    .select("total, commission")
    .eq("vendor", user.id)
    .eq("status", "delivered");

  if (ordErr) return json(500, { error: ordErr.message });

  const grossXof = (orders || []).reduce((s, o) => s + Math.round((o.total || 0) * EUR_TO_XOF), 0);
  const commXof  = (orders || []).reduce((s, o) => {
    const c = o.commission != null ? o.commission : (o.total || 0) * NEXUS_COMMISSION;
    return s + Math.round(c * EUR_TO_XOF);
  }, 0);
  const netXof = grossXof - commXof;

  // ── Historique des retraits ───────────────────────────────────────────────
  const { data: payouts, error: payErr } = await sb
    .from("payout_requests")
    .select("id, amount_xof, method, provider, destination, status, ref_command, paytech_ref, created_at, paid_at, failed_at, failure_reason")
    .eq("vendor_id", user.id)
    .order("created_at", { ascending: false });

  if (payErr) return json(500, { error: payErr.message });

  // ── Calcul des soldes ─────────────────────────────────────────────────────
  const usedXof      = (payouts || [])
    .filter(p => ["pending", "processing", "paid"].includes(p.status))
    .reduce((s, p) => s + (p.amount_xof || 0), 0);
  const paidXof      = (payouts || [])
    .filter(p => p.status === "paid")
    .reduce((s, p) => s + (p.amount_xof || 0), 0);
  const pendingXof   = (payouts || [])
    .filter(p => ["pending", "processing"].includes(p.status))
    .reduce((s, p) => s + (p.amount_xof || 0), 0);
  const availableXof = Math.max(0, netXof - usedXof);

  return json(200, {
    wallet: {
      gross_xof:      grossXof,
      commission_xof: commXof,
      net_xof:        netXof,
      pending_xof:    pendingXof,
      paid_xof:       paidXof,
      available_xof:  availableXof,
    },
    payouts: payouts || [],
  });
}

// OPTIONS (CORS pre-flight — géré aussi par _middleware.js)
export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin":  "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}
