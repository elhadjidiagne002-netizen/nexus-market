// /.netlify/functions/payout-history
// GET → Retourne le solde disponible + l'historique des retraits du vendeur
//
// Auth : Bearer {supabase_jwt}

const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL     = process.env.SUPABASE_URL     || "https://pqcqbstbdujzaclsiosv.supabase.co";
const SUPABASE_SERVICE = process.env.SUPABASE_SERVICE_KEY;

const NEXUS_COMMISSION = 0.15;
const EUR_TO_XOF       = 655.957;

function cors() {
  return {
    "Access-Control-Allow-Origin":  "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: cors(), body: "" };
  }
  if (event.httpMethod !== "GET") {
    return { statusCode: 405, headers: cors(), body: JSON.stringify({ error: "Method not allowed" }) };
  }

  if (!SUPABASE_SERVICE) {
    return { statusCode: 503, headers: cors(), body: JSON.stringify({ error: "Config manquante" }) };
  }

  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // ── Auth ──────────────────────────────────────────────────────────────────
  const authHeader = event.headers?.authorization || event.headers?.Authorization || "";
  if (!authHeader.startsWith("Bearer ")) {
    return { statusCode: 401, headers: cors(), body: JSON.stringify({ error: "Token manquant" }) };
  }
  const { data: { user }, error: authErr } = await sb.auth.getUser(authHeader.slice(7));
  if (authErr || !user) {
    return { statusCode: 401, headers: cors(), body: JSON.stringify({ error: "Token invalide" }) };
  }

  // ── Commandes livrées ─────────────────────────────────────────────────────
  const { data: orders, error: ordErr } = await sb
    .from("orders")
    .select("total, commission")
    .eq("vendor", user.id)
    .eq("status", "delivered");

  if (ordErr) {
    return { statusCode: 500, headers: cors(), body: JSON.stringify({ error: ordErr.message }) };
  }

  const grossXof = (orders || []).reduce((s, o) => s + Math.round((o.total || 0) * EUR_TO_XOF), 0);
  const commXof  = (orders || []).reduce((s, o) => {
    const c = o.commission != null ? o.commission : (o.total || 0) * NEXUS_COMMISSION;
    return s + Math.round(c * EUR_TO_XOF);
  }, 0);
  const netXof   = grossXof - commXof;

  // ── Historique des retraits ───────────────────────────────────────────────
  const { data: payouts, error: payErr } = await sb
    .from("payout_requests")
    .select("id, amount_xof, method, provider, destination, status, ref_command, paytech_ref, created_at, paid_at, failed_at, failure_reason")
    .eq("vendor_id", user.id)
    .order("created_at", { ascending: false });

  if (payErr) {
    return { statusCode: 500, headers: cors(), body: JSON.stringify({ error: payErr.message }) };
  }

  // ── Calcul solde ──────────────────────────────────────────────────────────
  const usedXof      = (payouts || []).filter(p => ["pending","processing","paid"].includes(p.status))
                                       .reduce((s, p) => s + (p.amount_xof || 0), 0);
  const paidXof      = (payouts || []).filter(p => p.status === "paid")
                                       .reduce((s, p) => s + (p.amount_xof || 0), 0);
  const pendingXof   = (payouts || []).filter(p => ["pending","processing"].includes(p.status))
                                       .reduce((s, p) => s + (p.amount_xof || 0), 0);
  const availableXof = Math.max(0, netXof - usedXof);

  return {
    statusCode: 200,
    headers: { ...cors(), "Content-Type": "application/json" },
    body: JSON.stringify({
      wallet: {
        gross_xof:     grossXof,
        commission_xof:commXof,
        net_xof:       netXof,
        pending_xof:   pendingXof,
        paid_xof:      paidXof,
        available_xof: availableXof,
      },
      payouts: payouts || [],
    }),
  };
};
