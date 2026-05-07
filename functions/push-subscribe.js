/**
 * functions/push-subscribe.js
 * ──────────────────────────────────────────────────────────────────────────
 * POST   /push-subscribe  → Enregistre un abonnement Web Push dans Supabase
 * DELETE /push-subscribe  → Supprime l'abonnement correspondant à l'endpoint
 *
 * Adaptation Netlify → Cloudflare :
 *   • exports.handler(event) → export async function onRequest(context)
 *   • event.httpMethod       → request.method
 *   • process.env            → env
 *   • event.body             → await request.json()
 *
 * Variables d'environnement Cloudflare :
 *   SUPABASE_URL         — URL du projet Supabase
 *   SUPABASE_SERVICE_KEY — Clé service_role (contourne RLS)
 */

import { createClient } from "@supabase/supabase-js";

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin":  "*",
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
    return json(503, { error: "SUPABASE_SERVICE_KEY non configurée" });
  }

  const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // ── Extraire user_id depuis le JWT Supabase ───────────────────────────────
  let userId = null;
  const auth = request.headers.get("authorization") || "";
  if (auth.startsWith("Bearer ")) {
    const { data: { user }, error } = await sb.auth.getUser(auth.slice(7));
    if (!error && user) userId = user.id;
  }

  // ── DELETE : désabonnement ────────────────────────────────────────────────
  if (method === "DELETE") {
    let endpoint;
    try { ({ endpoint } = await request.json()); } catch (_) {}

    if (!endpoint) {
      return json(400, { error: "endpoint manquant" });
    }
    await sb.from("push_subscriptions").delete().eq("endpoint", endpoint);
    return json(200, { ok: true });
  }

  // ── POST : abonnement ─────────────────────────────────────────────────────
  if (method === "POST") {
    let subscription, preferences;
    try { ({ subscription, preferences } = await request.json()); } catch (_) {}

    if (!subscription?.endpoint) {
      return json(400, { error: "subscription invalide" });
    }

    const row = {
      endpoint:    subscription.endpoint,
      p256dh:      subscription.keys?.p256dh || null,
      auth_key:    subscription.keys?.auth   || null,
      user_id:     userId,
      preferences: preferences || {},
      updated_at:  new Date().toISOString(),
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
