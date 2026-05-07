// /.netlify/functions/push-send
// Envoi de notifications Web Push via VAPID.
// Appelé par d'autres Netlify Functions ou directement depuis le client admin.
//
// Body attendu :
//   { userId?, title, body, url?, icon?, badge?, toAll? }
//
// Si userId est fourni → envoie seulement à cet utilisateur.
// Si toAll=true        → envoie à tous les abonnés (usage admin uniquement).

const webpush          = require("web-push");
const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL     = process.env.SUPABASE_URL     || "https://pqcqbstbdujzaclsiosv.supabase.co";
const SUPABASE_SERVICE = process.env.SUPABASE_SERVICE_KEY;
const VAPID_PUBLIC     = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE    = process.env.VAPID_PRIVATE_KEY;
const VAPID_EMAIL      = process.env.VAPID_EMAIL || "mailto:admin@nexus-market360.netlify.app";

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin":  "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: corsHeaders(), body: "" };
  }
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers: corsHeaders(), body: "" };
  }

  if (!VAPID_PUBLIC || !VAPID_PRIVATE || !SUPABASE_SERVICE) {
    return {
      statusCode: 503,
      headers: { ...corsHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Variables d'env VAPID ou Supabase manquantes" }),
    };
  }

  webpush.setVapidDetails(VAPID_EMAIL, VAPID_PUBLIC, VAPID_PRIVATE);

  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // ── Vérifier le token appelant (admin uniquement pour toAll) ─────────────────
  const authHeader = event.headers?.authorization || event.headers?.Authorization || "";
  let callerRole = null;
  if (authHeader.startsWith("Bearer ")) {
    const { data: { user } } = await sb.auth.getUser(authHeader.slice(7)).catch(() => ({ data: {} }));
    callerRole = user?.user_metadata?.role || null;
  }

  let payload;
  try { payload = JSON.parse(event.body || "{}"); } catch (_) {
    return { statusCode: 400, headers: corsHeaders(), body: JSON.stringify({ error: "JSON invalide" }) };
  }

  const { userId, title, body, url = "/", icon, badge, toAll = false } = payload;

  if (!title || !body) {
    return { statusCode: 400, headers: corsHeaders(), body: JSON.stringify({ error: "title et body requis" }) };
  }

  // Empêcher l'envoi global depuis un non-admin
  if (toAll && callerRole !== "admin") {
    return { statusCode: 403, headers: corsHeaders(), body: JSON.stringify({ error: "Réservé aux admins" }) };
  }

  // ── Récupérer les abonnements cibles ─────────────────────────────────────────
  let query = sb.from("push_subscriptions").select("endpoint, p256dh, auth_key");
  if (!toAll && userId) query = query.eq("user_id", userId);
  const { data: subs, error: dbErr } = await query;

  if (dbErr) {
    return { statusCode: 500, headers: corsHeaders(), body: JSON.stringify({ error: dbErr.message }) };
  }
  if (!subs || subs.length === 0) {
    return { statusCode: 200, headers: corsHeaders(), body: JSON.stringify({ sent: 0, message: "Aucun abonné" }) };
  }

  // ── Envoyer en parallèle ──────────────────────────────────────────────────────
  const notification = JSON.stringify({
    title,
    body,
    url,
    icon:  icon  || "https://placehold.co/192x192/00853E/white?text=NX",
    badge: badge || "https://placehold.co/72x72/00853E/white?text=NX",
  });

  const staleEndpoints = [];
  const results = await Promise.allSettled(
    subs.map(sub =>
      webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth_key } },
        notification,
        { TTL: 86400 }
      ).catch(err => {
        // 410 Gone = abonnement expiré → supprimer
        if (err.statusCode === 410 || err.statusCode === 404) {
          staleEndpoints.push(sub.endpoint);
        }
        throw err;
      })
    )
  );

  // Nettoyer les abonnements expirés
  if (staleEndpoints.length > 0) {
    await sb.from("push_subscriptions").delete().in("endpoint", staleEndpoints);
  }

  const sent   = results.filter(r => r.status === "fulfilled").length;
  const failed = results.filter(r => r.status === "rejected").length;

  return {
    statusCode: 200,
    headers: { ...corsHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ sent, failed, staleRemoved: staleEndpoints.length }),
  };
};
