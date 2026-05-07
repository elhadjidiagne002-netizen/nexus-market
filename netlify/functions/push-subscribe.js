// /.netlify/functions/push-subscribe
// POST  → enregistre un abonnement push dans Supabase (table push_subscriptions)
// DELETE → supprime l'abonnement correspondant à l'endpoint

const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL      = process.env.SUPABASE_URL      || "https://pqcqbstbdujzaclsiosv.supabase.co";
const SUPABASE_SERVICE  = process.env.SUPABASE_SERVICE_KEY;  // service_role key (env Netlify)

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin":  "*",
    "Access-Control-Allow-Methods": "POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}

exports.handler = async (event) => {
  // Preflight CORS
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: corsHeaders(), body: "" };
  }

  if (!SUPABASE_SERVICE) {
    return {
      statusCode: 503,
      headers: { ...corsHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ error: "SUPABASE_SERVICE_KEY non configurée" }),
    };
  }

  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // ── Extraire user_id depuis le JWT Supabase passé en Authorization ──────────
  let userId = null;
  const auth = event.headers?.authorization || event.headers?.Authorization || "";
  if (auth.startsWith("Bearer ")) {
    const token = auth.slice(7);
    const { data: { user }, error } = await sb.auth.getUser(token);
    if (!error && user) userId = user.id;
  }

  // ── DELETE : désabonnement ───────────────────────────────────────────────────
  if (event.httpMethod === "DELETE") {
    let endpoint;
    try { ({ endpoint } = JSON.parse(event.body || "{}")); } catch (_) {}
    if (!endpoint) {
      return { statusCode: 400, headers: corsHeaders(), body: JSON.stringify({ error: "endpoint manquant" }) };
    }
    await sb.from("push_subscriptions").delete().eq("endpoint", endpoint);
    return { statusCode: 200, headers: { ...corsHeaders(), "Content-Type": "application/json" }, body: JSON.stringify({ ok: true }) };
  }

  // ── POST : abonnement ────────────────────────────────────────────────────────
  if (event.httpMethod === "POST") {
    let subscription, preferences;
    try { ({ subscription, preferences } = JSON.parse(event.body || "{}")); } catch (_) {}

    if (!subscription?.endpoint) {
      return { statusCode: 400, headers: corsHeaders(), body: JSON.stringify({ error: "subscription invalide" }) };
    }

    const row = {
      endpoint:    subscription.endpoint,
      p256dh:      subscription.keys?.p256dh  || null,
      auth_key:    subscription.keys?.auth     || null,
      user_id:     userId,
      preferences: preferences || {},
      updated_at:  new Date().toISOString(),
    };

    const { error } = await sb
      .from("push_subscriptions")
      .upsert(row, { onConflict: "endpoint" });

    if (error) {
      console.error("[push-subscribe] upsert error:", error.message);
      return { statusCode: 500, headers: corsHeaders(), body: JSON.stringify({ error: error.message }) };
    }

    return {
      statusCode: 201,
      headers: { ...corsHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ ok: true }),
    };
  }

  return { statusCode: 405, headers: corsHeaders(), body: JSON.stringify({ error: "Method not allowed" }) };
};
