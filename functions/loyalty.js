/**
 * functions/loyalty.js – Programme de fidélité NEXUS Market
 */
import { createClient } from "@supabase/supabase-js";

const TIERS = [
  {
    name: "Bronze", icon: "🥉", color: "#CD7F32", min: 0, max: 999,
    multiplier: 1, perks: ["1 pt par euro", "Ventes flash 1h avant"],
  },
  {
    name: "Argent", icon: "🥈", color: "#C0C0C0", min: 1000, max: 4999,
    multiplier: 1.5, perks: ["1,5 pt/euro", "Livraison gratuite dès 10k FCFA", "Ventes flash 2h avant"],
  },
  {
    name: "Or", icon: "🥇", color: "#FFD700", min: 5000, max: 14999,
    multiplier: 2, perks: ["2 pts/euro", "Livraison gratuite dès 5k FCFA", "Support prioritaire", "Cadeau anniversaire"],
  },
  {
    name: "Platine", icon: "💎", color: "#E5E4E2", min: 15000, max: Infinity,
    multiplier: 3, perks: ["3 pts/euro", "Livraison gratuite illimitée", "Gestionnaire dédié", "Accès exclusif"],
  },
];

const MIN_REDEEM = 500;
const POINTS_PER_EURO = 10;
const POINTS_TO_FCFA = 100;

function getTier(points) {
  const tier = [...TIERS].reverse().find(t => points >= t.min) || TIERS[0];
  const idx = TIERS.indexOf(tier);
  const next = TIERS[idx + 1] || null;
  const progress = next
    ? Math.min(100, Math.round(((points - tier.min) / (next.min - tier.min)) * 100))
    : 100;
  return {
    ...tier,
    progress,
    nextTierName: next?.name || null,
    nextTierMin: next?.min || null,
  };
}

export async function onRequest(context) {
  const { request, env } = context;
  const method = request.method;

  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
  const json = (status, body) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json", ...cors },
    });

  const { SUPABASE_URL, SUPABASE_SERVICE_KEY } = env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return json(503, { error: "Configuration Supabase incomplète" });
  }

  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false },
  });

  const authHeader = request.headers.get("Authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) return json(401, { error: "Token manquant" });

  // [SÉCURITÉ] La branche « appel service » qui acceptait la SUPABASE_SERVICE_KEY
  // comme Bearer token a été supprimée : elle permettait à quiconque détenant la
  // service key de créditer des points arbitrairement, sans session utilisateur.
  // Le seul appelant interne (paytech-webhook.js) utilise désormais directement
  // le RPC Supabase `add_loyalty_points` — plus aucun appel HTTP interne ici.
  let userId;

  // Authentification utilisateur normale
  const { data: { user }, error: authErr } = await sb.auth.getUser(token);
  if (authErr || !user) return json(401, { error: "Token invalide" });
  userId = user.id;

  // ─── GET : solde + historique ────────────────────────────────
  if (method === "GET") {
    const { data: lp } = await sb
      .from("loyalty_points")
      .select("points, total_earned, total_redeemed, updated_at")
      .eq("user_id", userId)
      .maybeSingle();

    const points = lp?.points || 0;

    const { data: history } = await sb
      .from("loyalty_history")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(20);

    return json(200, {
      points,
      totalEarned: lp?.total_earned || 0,
      totalRedeemed: lp?.total_redeemed || 0,
      canRedeem: points >= MIN_REDEEM,
      minRedeem: MIN_REDEEM,
      fcfaValue: Math.floor(points / POINTS_TO_FCFA),
      tier: getTier(points),
      tiers: TIERS.map(({ name, icon, color, min, perks, multiplier }) => ({
        name, icon, color, min, perks, multiplier,
      })),
      history: history || [],
    });
  }

  // ─── POST : créditer des points ──────────────────────────────
  if (method === "POST") {
    let body;
    try { body = await request.json(); } catch { return json(400, { error: "JSON invalide" }); }

    const { delta, reason = "order", orderId, note, amountEur } = body;

    let pointsDelta = delta;
    if (!pointsDelta && amountEur) {
      const { data: current } = await sb
        .from("loyalty_points").select("points").eq("user_id", userId).maybeSingle();
      const currentPoints = current?.points || 0;
      const tier = getTier(currentPoints);
      pointsDelta = Math.floor(Number(amountEur) * POINTS_PER_EURO * tier.multiplier);
    }

    if (!pointsDelta || isNaN(pointsDelta)) {
      return json(400, { error: "delta ou amountEur requis" });
    }

    const { data: result, error: fnErr } = await sb.rpc("add_loyalty_points", {
      p_user_id: userId,
      p_delta: pointsDelta,
      p_reason: reason,
      p_order_id: orderId || null,
      p_note: note || null,
    });

    if (fnErr) {
      console.error("[Loyalty POST]", fnErr.message);
      return json(500, { error: "Erreur crédit points" });
    }

    const newPoints = result?.points || 0;
    console.log(`[Loyalty] +${pointsDelta} pts → user=${userId} (total=${newPoints})`);

    return json(200, {
      success: true,
      pointsAdded: pointsDelta,
      points: newPoints,
      totalEarned: result?.total_earned || 0,
      totalRedeemed: result?.total_redeemed || 0,
      tier: getTier(newPoints),
      fcfaValue: Math.floor(newPoints / POINTS_TO_FCFA),
    });
  }

  // ─── DELETE : utiliser des points ─────────────────────────────
  if (method === "DELETE") {
    let body;
    try { body = await request.json(); } catch { return json(400, { error: "JSON invalide" }); }

    const { points: ptsToUse, orderId } = body;
    if (!ptsToUse || ptsToUse < MIN_REDEEM) {
      return json(400, { error: `Minimum ${MIN_REDEEM} points requis (reçu ${ptsToUse})` });
    }

    const { data: current } = await sb
      .from("loyalty_points").select("points").eq("user_id", userId).maybeSingle();
    if ((current?.points || 0) < ptsToUse) {
      return json(400, { error: "Solde insuffisant" });
    }

    const discount = Math.floor(ptsToUse / POINTS_TO_FCFA);

    const { data: result, error: fnErr } = await sb.rpc("add_loyalty_points", {
      p_user_id: userId,
      p_delta: -ptsToUse,
      p_reason: "redeem",
      p_order_id: orderId || null,
      p_note: `Réduction ${discount} FCFA`,
    });

    if (fnErr) {
      console.error("[Loyalty DELETE]", fnErr.message);
      return json(500, { error: "Erreur déduction points" });
    }

    console.log(`[Loyalty] -${ptsToUse} pts → user=${userId} (réduction=${discount} FCFA)`);
    return json(200, {
      success: true,
      pointsUsed: ptsToUse,
      fcfaDiscount: discount,
      points: result?.points || 0,
      tier: getTier(result?.points || 0),
    });
  }

  return json(405, { error: "Méthode non autorisée" });
}
