/**
 * functions/push-send.js
 * ──────────────────────────────────────────────────────────────────────────
 * POST /push-send → Envoie des notifications Web Push via VAPID
 *
 * Adaptation Netlify → Cloudflare :
 *   • Le package `web-push` fonctionne dans Cloudflare Workers grâce au flag
 *     `nodejs_compat` défini dans wrangler.toml.
 *   • process.env → env
 *   • exports.handler(event) → export async function onRequestPost(context)
 *   • event.body → await request.json()
 *
 * Body attendu :
 *   { userId?, title, body, url?, icon?, badge?, toAll? }
 *
 * Variables d'environnement Cloudflare :
 *   SUPABASE_URL         — URL Supabase
 *   SUPABASE_SERVICE_KEY — Clé service_role
 *   VAPID_PUBLIC_KEY     — Clé VAPID publique
 *   VAPID_PRIVATE_KEY    — Clé VAPID privée (secret !)
 *   VAPID_EMAIL          — Contact email pour VAPID (ex: mailto:admin@…)
 */

import webpush          from "web-push";
import { createClient } from "@supabase/supabase-js";

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin":  "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders() },
  });
}

export async function onRequestPost(context) {
  const { request, env } = context;

  const {
    SUPABASE_URL, SUPABASE_SERVICE_KEY,
    VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY,
    VAPID_EMAIL = "mailto:admin@nexus-market.com",
  } = env;

  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY || !SUPABASE_SERVICE_KEY) {
    return json(503, { error: "Variables d'env VAPID ou Supabase manquantes" });
  }

  // Configurer web-push (exécuté une fois par requête dans le Worker)
  webpush.setVapidDetails(VAPID_EMAIL, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // ── Vérifier le token appelant (admin requis pour toAll) ──────────────────
  const authHeader = request.headers.get("authorization") || "";
  let callerRole = null;
  if (authHeader.startsWith("Bearer ")) {
    const { data: { user } } = await sb.auth.getUser(authHeader.slice(7))
      .catch(() => ({ data: {} }));
    callerRole = user?.user_metadata?.role || null;
  }

  // ── Lecture du body ───────────────────────────────────────────────────────
  let payload;
  try { payload = await request.json(); }
  catch { return json(400, { error: "JSON invalide" }); }

  const { userId, title, body, url = "/", icon, badge, toAll = false } = payload;

  if (!title || !body) {
    return json(400, { error: "title et body requis" });
  }

  if (toAll && callerRole !== "admin") {
    return json(403, { error: "Réservé aux admins" });
  }

  // ── Récupérer les abonnements cibles ──────────────────────────────────────
  let query = sb.from("push_subscriptions").select("endpoint, p256dh, auth_key");
  if (!toAll && userId) query = query.eq("user_id", userId);

  const { data: subs, error: dbErr } = await query;

  if (dbErr) return json(500, { error: dbErr.message });
  if (!subs || subs.length === 0) {
    return json(200, { sent: 0, message: "Aucun abonné" });
  }

  // ── Payload de la notification ────────────────────────────────────────────
  const notification = JSON.stringify({
    title,
    body,
    url,
    icon:  icon  || "https://placehold.co/192x192/00853E/white?text=NX",
    badge: badge || "https://placehold.co/72x72/00853E/white?text=NX",
  });

  // ── Envoi en parallèle ────────────────────────────────────────────────────
  const staleEndpoints = [];

  const results = await Promise.allSettled(
    subs.map(sub =>
      webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth_key } },
        notification,
        { TTL: 86400 }
      ).catch(err => {
        if (err.statusCode === 410 || err.statusCode === 404) {
          staleEndpoints.push(sub.endpoint);
        }
        throw err;
      })
    )
  );

  // Nettoyer les abonnements expirés (fire & forget)
  if (staleEndpoints.length > 0) {
    context.waitUntil(
      sb.from("push_subscriptions").delete().in("endpoint", staleEndpoints)
    );
  }

  const sent   = results.filter(r => r.status === "fulfilled").length;
  const failed = results.filter(r => r.status === "rejected").length;

  console.log(`[push-send] sent=${sent} failed=${failed} stale=${staleEndpoints.length}`);

  return json(200, { sent, failed, staleRemoved: staleEndpoints.length });
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: corsHeaders() });
}
