/**
 * functions/push-subscribe.js
 * POST   → enregistre un abonnement push
 * DELETE → supprime un abonnement (par endpoint)
 */
import { createClient } from "@supabase/supabase-js";

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders() },
  });
}

export async function onRequest(context) {
  const { request, env } = context;
  const method = request.method;

  if (!env.SUPABASE_SERVICE_KEY) {
    return json(503, { error: "SUPABASE_SERVICE_KEY manquante" });
  }

  const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Extraction user_id depuis le JWT (optionnel)
  let userId = null;
  const auth = request.headers.get("Authorization") || "";
  if (auth.startsWith("Bearer ")) {
    // [FIX] .catch(() => ({})) provoquait un crash car la déstructuration
    // { data: { user } } échoue si le fallback ne contient pas de .data.
    const { data: { user } } = await sb.auth.getUser(auth.slice(7))
      .catch(() => ({ data: { user: null } }));
    if (user) userId = user.id;
  }

  // DELETE – désabonnement
  if (method === "DELETE") {
    let endpoint;
    try { ({ endpoint } = await request.json()); } catch {}
    if (!endpoint) return json(400, { error: "endpoint manquant" });
    await sb.from("push_subscriptions").delete().eq("endpoint", endpoint);
    return json(200, { ok: true });
  }

  // POST – abonnement
  if (method === "POST") {
    let subscription, preferences;
    try { ({ subscription, preferences } = await request.json()); } catch {}
    if (!subscription?.endpoint) return json(400, { error: "subscription invalide" });

    const row = {
      endpoint: subscription.endpoint,
      p256dh: subscription.keys?.p256dh || null,
      auth_key: subscription.keys?.auth || null,
      user_id: userId,
      preferences: preferences || {},
      updated_at: new Date().toISOString(),
    };

    const { error } = await sb
      .from("push_subscriptions")
      .upsert(row, { onConflict: "endpoint" });

    if (error) {
      console.error("[push-subscribe] upsert error:", error.message);
      return json(500, { error: error.message });
    }

    return json(201, { ok: true });
  }

  return json(405, { error: "Method not allowed" });
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: corsHeaders() });
}
