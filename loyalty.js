/**
 * Netlify Function — Programme de fidélité NEXUS Market
 * ─────────────────────────────────────────────────────
 * GET  /.netlify/functions/loyalty              → solde + tier + historique
 * POST /.netlify/functions/loyalty              → créditer des points
 * DELETE /.netlify/functions/loyalty            → utiliser des points (redeem)
 *
 * Variables d'environnement (Netlify Dashboard) :
 *   SUPABASE_URL         → URL du projet Supabase
 *   SUPABASE_SERVICE_KEY → Clé service_role (contourne RLS)
 *
 * Authentification : Bearer token Supabase dans le header Authorization
 */

const { createClient } = require("@supabase/supabase-js");

// ── Paliers de fidélité ────────────────────────────────────────────────────
const TIERS = [
  {
    name:      "Bronze",
    icon:      "🥉",
    color:     "#CD7F32",
    min:       0,
    max:       999,
    multiplier: 1,           // 1× les points sur chaque commande
    perks:     ["1 pt par euro dépensé", "Accès aux ventes flash 1h avant"],
  },
  {
    name:      "Argent",
    icon:      "🥈",
    color:     "#C0C0C0",
    min:       1000,
    max:       4999,
    multiplier: 1.5,
    perks:     ["1,5 pt par euro dépensé", "Livraison gratuite dès 10 000 FCFA", "Accès anticipé ventes flash 2h"],
  },
  {
    name:      "Or",
    icon:      "🥇",
    color:     "#FFD700",
    min:       5000,
    max:       14999,
    multiplier: 2,
    perks:     ["2 pts par euro dépensé", "Livraison gratuite dès 5 000 FCFA", "Support prioritaire", "Cadeau anniversaire"],
  },
  {
    name:      "Platine",
    icon:      "💎",
    color:     "#E5E4E2",
    min:       15000,
    max:       Infinity,
    multiplier: 3,
    perks:     ["3 pts par euro dépensé", "Livraison gratuite illimitée", "Gestionnaire de compte dédié", "Accès exclusif nouveautés"],
  },
];

const MIN_REDEEM_POINTS = 500;  // 500 pts minimum pour utiliser
const POINTS_PER_EURO   = 10;   // 10 pts / 1 € dépensé (modifiable)
const POINTS_TO_FCFA    = 100;  // 100 pts = 1 FCFA de réduction

function getTier(points) {
  const tier = [...TIERS].reverse().find(t => points >= t.min) || TIERS[0];
  const idx   = TIERS.indexOf(tier);
  const next  = TIERS[idx + 1] || null;
  const progress = next
    ? Math.min(100, Math.round(((points - tier.min) / (next.min - tier.min)) * 100))
    : 100;
  return {
    ...tier,
    progress,
    nextTier:      next ? `${(next.min - points).toLocaleString("fr-FR")} pts pour ${next.name} ${next.icon}` : null,
    nextTierName:  next?.name || null,
    nextTierMin:   next?.min  || null,
  };
}

exports.handler = async (event) => {
  // ── CORS ─────────────────────────────────────────────────────────────────
  const headers = {
    "Content-Type":                  "application/json",
    "Access-Control-Allow-Origin":   "*",
    "Access-Control-Allow-Methods":  "GET, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers":  "Content-Type, Authorization",
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers, body: "" };
  }

  // ── Auth : extraire l'utilisateur depuis le Bearer token ─────────────────
  const authHeader = event.headers["authorization"] || event.headers["Authorization"] || "";
  const token      = authHeader.replace(/^Bearer\s+/i, "").trim();

  if (!token) {
    return { statusCode: 401, headers, body: JSON.stringify({ error: "Token manquant" }) };
  }

  const SUPABASE_URL         = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error("[Loyalty] Variables d'environnement Supabase manquantes");
    return { statusCode: 500, headers, body: JSON.stringify({ error: "Configuration serveur incomplète" }) };
  }

  // Client admin (service_role) pour contourner RLS
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false },
  });

  // Vérifier le token et récupérer l'utilisateur
  const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
  if (authErr || !user) {
    return { statusCode: 401, headers, body: JSON.stringify({ error: "Token invalide ou expiré" }) };
  }

  const userId = user.id;

  // ═══════════════════════════════════════════════════════════════════════
  // GET — Solde + tier + historique (20 dernières transactions)
  // ═══════════════════════════════════════════════════════════════════════
  if (event.httpMethod === "GET") {
    // Solde actuel
    const { data: lpData, error: lpErr } = await supabase
      .from("loyalty_points")
      .select("points, total_earned, total_redeemed, updated_at")
      .eq("user_id", userId)
      .maybeSingle();

    if (lpErr) {
      console.error("[Loyalty GET] Erreur solde:", lpErr.message);
      return { statusCode: 500, headers, body: JSON.stringify({ error: "Erreur lecture solde" }) };
    }

    const points        = lpData?.points         || 0;
    const totalEarned   = lpData?.total_earned   || 0;
    const totalRedeemed = lpData?.total_redeemed || 0;

    // Historique des 20 dernières transactions
    const { data: history } = await supabase
      .from("loyalty_history")
      .select("id, delta, reason, order_id, note, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(20);

    const tier = getTier(points);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        points,
        totalEarned,
        totalRedeemed,
        canRedeem:   points >= MIN_REDEEM_POINTS,
        minRedeem:   MIN_REDEEM_POINTS,
        fcfaValue:   Math.floor(points / POINTS_TO_FCFA),
        pointsRate:  POINTS_PER_EURO,
        tier,
        tiers:       TIERS.map(t => ({ name: t.name, icon: t.icon, color: t.color, min: t.min, perks: t.perks, multiplier: t.multiplier })),
        history:     history || [],
      }),
    };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // POST — Créditer des points (commande, bonus, parrainage)
  // Body: { delta: number, reason: string, orderId?: string, note?: string }
  // ═══════════════════════════════════════════════════════════════════════
  if (event.httpMethod === "POST") {
    let body;
    try { body = JSON.parse(event.body || "{}"); }
    catch { return { statusCode: 400, headers, body: JSON.stringify({ error: "JSON invalide" }) }; }

    const { delta, reason = "order", orderId, note, amountEur } = body;

    // Calculer les points si on reçoit un montant en euros
    let pointsDelta = delta;
    if (!pointsDelta && amountEur) {
      // Récupérer le multiplicateur du palier actuel
      const { data: current } = await supabase
        .from("loyalty_points").select("points").eq("user_id", userId).maybeSingle();
      const currentPts   = current?.points || 0;
      const currentTier  = getTier(currentPts);
      pointsDelta = Math.floor(Number(amountEur) * POINTS_PER_EURO * currentTier.multiplier);
    }

    if (!pointsDelta || isNaN(pointsDelta)) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: "delta ou amountEur requis" }) };
    }

    // Appel de la fonction SQL atomique
    const { data: result, error: fnErr } = await supabase.rpc("add_loyalty_points", {
      p_user_id:  userId,
      p_delta:    pointsDelta,
      p_reason:   reason,
      p_order_id: orderId || null,
      p_note:     note    || null,
    });

    if (fnErr) {
      console.error("[Loyalty POST] Erreur RPC:", fnErr.message);
      return { statusCode: 500, headers, body: JSON.stringify({ error: "Erreur crédit points: " + fnErr.message }) };
    }

    const newPoints = result?.points || 0;
    console.log(`[Loyalty] ✅ +${pointsDelta} pts → user=${userId} reason=${reason} total=${newPoints}`);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success:      true,
        pointsAdded:  pointsDelta,
        points:       newPoints,
        totalEarned:  result?.total_earned   || 0,
        totalRedeemed: result?.total_redeemed || 0,
        tier:         getTier(newPoints),
        fcfaValue:    Math.floor(newPoints / POINTS_TO_FCFA),
      }),
    };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // DELETE — Utiliser des points (redeem au checkout)
  // Body: { points: number, orderId: string }
  // ═══════════════════════════════════════════════════════════════════════
  if (event.httpMethod === "DELETE") {
    let body;
    try { body = JSON.parse(event.body || "{}"); }
    catch { return { statusCode: 400, headers, body: JSON.stringify({ error: "JSON invalide" }) }; }

    const { points: ptsToUse, orderId } = body;

    if (!ptsToUse || ptsToUse < MIN_REDEEM_POINTS) {
      return {
        statusCode: 400, headers,
        body: JSON.stringify({ error: `Minimum ${MIN_REDEEM_POINTS} pts requis (reçu: ${ptsToUse})` }),
      };
    }

    // Vérifier le solde disponible
    const { data: current } = await supabase
      .from("loyalty_points").select("points").eq("user_id", userId).maybeSingle();

    if ((current?.points || 0) < ptsToUse) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: "Solde insuffisant" }) };
    }

    const fcfaDiscount = Math.floor(ptsToUse / POINTS_TO_FCFA);

    // Déduire les points via la fonction atomique
    const { data: result, error: fnErr } = await supabase.rpc("add_loyalty_points", {
      p_user_id:  userId,
      p_delta:    -ptsToUse,
      p_reason:   "redeem",
      p_order_id: orderId || null,
      p_note:     `Réduction de ${fcfaDiscount} FCFA`,
    });

    if (fnErr) {
      console.error("[Loyalty DELETE] Erreur RPC:", fnErr.message);
      return { statusCode: 500, headers, body: JSON.stringify({ error: "Erreur déduction points" }) };
    }

    console.log(`[Loyalty] ✅ -${ptsToUse} pts → user=${userId} réduction=${fcfaDiscount} FCFA`);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success:      true,
        pointsUsed:   ptsToUse,
        fcfaDiscount,
        points:       result?.points || 0,
        tier:         getTier(result?.points || 0),
      }),
    };
  }

  return { statusCode: 405, headers, body: JSON.stringify({ error: "Méthode non autorisée" }) };
};
