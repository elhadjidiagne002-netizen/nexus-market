/**
 * functions/loyalty.js — Programme de fidélité NEXUS Market
 * ──────────────────────────────────────────────────────────────────────────
 * GET    /loyalty  → solde + tier + historique
 * POST   /loyalty  → créditer des points
 * DELETE /loyalty  → utiliser des points (redeem)
 *
 * Différences Netlify → Cloudflare Pages Functions :
 *  • exports.handler(event)       → export async function onRequest(context)
 *  • event.httpMethod             → request.method
 *  • event.headers["x"]          → request.headers.get("x")
 *  • event.body                   → await request.text() / request.json()
 *  • process.env.X                → env.X  (injecté par Cloudflare via wrangler.toml)
 *  • return { statusCode, body }  → return new Response(body, { status })
 *
 * Variables d'environnement (Cloudflare Dashboard → Settings → Variables) :
 *   SUPABASE_URL          → URL du projet Supabase
 *   SUPABASE_SERVICE_KEY  → Clé service_role (contourne RLS)
 */

import { createClient } from "@supabase/supabase-js";

// ── Paliers de fidélité ────────────────────────────────────────────────────
const TIERS = [
  {
    name:       "Bronze",
    icon:       "🥉",
    color:      "#CD7F32",
    min:        0,
    max:        999,
    multiplier: 1,
    perks:      ["1 pt par euro dépensé", "Accès aux ventes flash 1h avant"],
  },
  {
    name:       "Argent",
    icon:       "🥈",
    color:      "#C0C0C0",
    min:        1000,
    max:        4999,
    multiplier: 1.5,
    perks:      ["1,5 pt par euro dépensé", "Livraison gratuite dès 10 000 FCFA", "Accès anticipé ventes flash 2h"],
  },
  {
    name:       "Or",
    icon:       "🥇",
    color:      "#FFD700",
    min:        5000,
    max:        14999,
    multiplier: 2,
    perks:      ["2 pts par euro dépensé", "Livraison gratuite dès 5 000 FCFA", "Support prioritaire", "Cadeau anniversaire"],
  },
  {
    name:       "Platine",
    icon:       "💎",
    color:      "#E5E4E2",
    min:        15000,
    max:        Infinity,
    multiplier: 3,
    perks:      ["3 pts par euro dépensé", "Livraison gratuite illimitée", "Gestionnaire de compte dédié", "Accès exclusif nouveautés"],
  },
];

const MIN_REDEEM_POINTS = 500;
const POINTS_PER_EURO   = 10;
const POINTS_TO_FCFA    = 100;

function getTier(points) {
  const tier    = [...TIERS].reverse().find(t => points >= t.min) || TIERS[0];
  const idx     = TIERS.indexOf(tier);
  const next    = TIERS[idx + 1] || null;
  const progress = next
    ? Math.min(100, Math.round(((points - tier.min) / (next.min - tier.min)) * 100))
    : 100;
  return {
    ...tier,
    progress,
    nextTier:     next ? `${(next.min - points).toLocaleString("fr-FR")} pts pour ${next.name} ${next.icon}` : null,
    nextTierName: next?.name || null,
    nextTierMin:  next?.min  || null,
  };
}

// ── Handler principal ──────────────────────────────────────────────────────
export async function onRequest(context) {
  const { request, env } = context;
  const method = request.method;

  // Helper réponse JSON avec CORS
  const json = (status, body) =>
    new Response(JSON.stringify(body), {
      status,
      headers: {
        "Content-Type":                 "application/json",
        "Access-Control-Allow-Origin":  "*",
        "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
    });

  // ── Vérification variables d'env ─────────────────────────────────────────
  const { SUPABASE_URL, SUPABASE_SERVICE_KEY } = env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error("[Loyalty] Variables Supabase manquantes");
    return json(500, { error: "Configuration serveur incomplète" });
  }

  // ── Auth : extraire le Bearer token ──────────────────────────────────────
  const authHeader = request.headers.get("authorization") || request.headers.get("Authorization") || "";
  const token      = authHeader.replace(/^Bearer\s+/i, "").trim();

  if (!token) return json(401, { error: "Token manquant" });

  // Client Supabase avec service_role (contourne RLS)
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false },
  });

  const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
  if (authErr || !user) return json(401, { error: "Token invalide ou expiré" });

  const userId = user.id;

  // ═══════════════════════════════════════════════════════════════════════
  // GET — Solde + tier + historique
  // ═══════════════════════════════════════════════════════════════════════
  if (method === "GET") {
    const { data: lpData, error: lpErr } = await supabase
      .from("loyalty_points")
      .select("points, total_earned, total_redeemed, updated_at")
      .eq("user_id", userId)
      .maybeSingle();

    if (lpErr) {
      console.error("[Loyalty GET]", lpErr.message);
      return json(500, { error: "Erreur lecture solde" });
    }

    const points        = lpData?.points         || 0;
    const totalEarned   = lpData?.total_earned   || 0;
    const totalRedeemed = lpData?.total_redeemed || 0;

    const { data: history } = await supabase
      .from("loyalty_history")
      .select("id, delta, reason, order_id, note, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(20);

    return json(200, {
      points,
      totalEarned,
      totalRedeemed,
      canRedeem:  points >= MIN_REDEEM_POINTS,
      minRedeem:  MIN_REDEEM_POINTS,
      fcfaValue:  Math.floor(points / POINTS_TO_FCFA),
      pointsRate: POINTS_PER_EURO,
      tier:       getTier(points),
      tiers:      TIERS.map(t => ({ name: t.name, icon: t.icon, color: t.color, min: t.min, perks: t.perks, multiplier: t.multiplier })),
      history:    history || [],
    });
  }

  // ═══════════════════════════════════════════════════════════════════════
  // POST — Créditer des points
  // Body : { delta, reason?, orderId?, note?, amountEur? }
  // ═══════════════════════════════════════════════════════════════════════
  if (method === "POST") {
    let body;
    try { body = await request.json(); }
    catch { return json(400, { error: "JSON invalide" }); }

    const { delta, reason = "order", orderId, note, amountEur } = body;

    let pointsDelta = delta;
    if (!pointsDelta && amountEur) {
      const { data: current } = await supabase
        .from("loyalty_points").select("points").eq("user_id", userId).maybeSingle();
      const currentPts  = current?.points || 0;
      const currentTier = getTier(currentPts);
      pointsDelta = Math.floor(Number(amountEur) * POINTS_PER_EURO * currentTier.multiplier);
    }

    if (!pointsDelta || isNaN(pointsDelta)) {
      return json(400, { error: "delta ou amountEur requis" });
    }

    const { data: result, error: fnErr } = await supabase.rpc("add_loyalty_points", {
      p_user_id:  userId,
      p_delta:    pointsDelta,
      p_reason:   reason,
      p_order_id: orderId || null,
      p_note:     note    || null,
    });

    if (fnErr) {
      console.error("[Loyalty POST]", fnErr.message);
      return json(500, { error: "Erreur crédit points: " + fnErr.message });
    }

    const newPoints = result?.points || 0;
    console.log(`[Loyalty] +${pointsDelta} pts → user=${userId} total=${newPoints}`);

    return json(200, {
      success:       true,
      pointsAdded:   pointsDelta,
      points:        newPoints,
      totalEarned:   result?.total_earned   || 0,
      totalRedeemed: result?.total_redeemed || 0,
      tier:          getTier(newPoints),
      fcfaValue:     Math.floor(newPoints / POINTS_TO_FCFA),
    });
  }

  // ═══════════════════════════════════════════════════════════════════════
  // DELETE — Utiliser des points (redeem)
  // Body : { points, orderId }
  // ═══════════════════════════════════════════════════════════════════════
  if (method === "DELETE") {
    let body;
    try { body = await request.json(); }
    catch { return json(400, { error: "JSON invalide" }); }

    const { points: ptsToUse, orderId } = body;

    if (!ptsToUse || ptsToUse < MIN_REDEEM_POINTS) {
      return json(400, { error: `Minimum ${MIN_REDEEM_POINTS} pts requis (reçu: ${ptsToUse})` });
    }

    const { data: current } = await supabase
      .from("loyalty_points").select("points").eq("user_id", userId).maybeSingle();

    if ((current?.points || 0) < ptsToUse) {
      return json(400, { error: "Solde insuffisant" });
    }

    const fcfaDiscount = Math.floor(ptsToUse / POINTS_TO_FCFA);

    const { data: result, error: fnErr } = await supabase.rpc("add_loyalty_points", {
      p_user_id:  userId,
      p_delta:    -ptsToUse,
      p_reason:   "redeem",
      p_order_id: orderId || null,
      p_note:     `Réduction de ${fcfaDiscount} FCFA`,
    });

    if (fnErr) {
      console.error("[Loyalty DELETE]", fnErr.message);
      return json(500, { error: "Erreur déduction points" });
    }

    console.log(`[Loyalty] -${ptsToUse} pts → user=${userId} réduction=${fcfaDiscount} FCFA`);

    return json(200, {
      success:      true,
      pointsUsed:   ptsToUse,
      fcfaDiscount,
      points:       result?.points || 0,
      tier:         getTier(result?.points || 0),
    });
  }

  return json(405, { error: "Méthode non autorisée" });
}
