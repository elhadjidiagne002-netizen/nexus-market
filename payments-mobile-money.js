/**
 * Netlify Function — PayTech Mobile Money
 * POST /api/payments/mobile-money
 *
 * Variables d'environnement requises :
 *   PAYTECH_API_KEY      — clé API PayTech
 *   PAYTECH_SECRET_KEY   — clé secrète PayTech
 *   PAYTECH_ENV          — "prod" | "test"
 *   FRONTEND_URL         — https://nexus-market-md360.netlify.app
 *   SUPABASE_URL         — URL du projet Supabase
 *   SUPABASE_SERVICE_KEY — clé service_role Supabase
 *
 * Body attendu : { orderId, amount, items?, userId? }
 * Réponse OK   : { redirect_url, token, orderId, amountFcfa }
 *
 * Flux :
 *   1. Valider les paramètres
 *   2. Idempotence — vérifier si la commande existe déjà
 *   3. Créer la commande en base (statut "pending")    ← NOUVEAU
 *   4. Appeler l'API PayTech
 *   5. Sauvegarder le token + passer en "awaiting_payment" ← NOUVEAU
 */

const { createClient } = require("@supabase/supabase-js");

const EUR_TO_FCFA = 655.957;

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL ou SUPABASE_SERVICE_KEY manquant");
  return createClient(url, key, { auth: { persistSession: false } });
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: corsHeaders(), body: "" };
  if (event.httpMethod !== "POST") return json(405, { error: "Méthode non autorisée" });

  const PAYTECH_API_KEY    = process.env.PAYTECH_API_KEY;
  const PAYTECH_SECRET_KEY = process.env.PAYTECH_SECRET_KEY;
  const PAYTECH_ENV        = process.env.PAYTECH_ENV || "prod";
  const FRONTEND_URL       = process.env.FRONTEND_URL || `https://${event.headers["host"]}`;

  if (!PAYTECH_API_KEY || !PAYTECH_SECRET_KEY) {
    console.error("[PayTech] Clés API manquantes");
    return json(500, { error: "Configuration serveur incomplète — contacter l'administrateur" });
  }

  // ── Parser le body ──────────────────────────────────────────────────────────
  let body;
  try { body = JSON.parse(event.body || "{}"); }
  catch { return json(400, { error: "Corps JSON invalide" }); }

  const { orderId, amount, items = [], userId = null } = body;
  if (!orderId || amount == null || isNaN(Number(amount))) {
    return json(400, { error: "orderId et amount (EUR) sont requis" });
  }

  const amountEur  = Number(amount);
  const amountFcfa = Math.round(amountEur * EUR_TO_FCFA);
  if (amountFcfa < 100) {
    return json(400, { error: `Montant trop faible : ${amountFcfa} FCFA (minimum 100 FCFA)` });
  }

  // ── Initialiser Supabase ────────────────────────────────────────────────────
  let supabase;
  try { supabase = getSupabase(); }
  catch (err) {
    console.error("[Supabase] Init impossible:", err.message);
    return json(500, { error: "Configuration base de données incomplète" });
  }

  // ── ÉTAPE 1 — Idempotence : vérifier si la commande existe déjà ────────────
  const { data: existingOrder, error: fetchError } = await supabase
    .from("orders")
    .select("id, status, paytech_token")
    .eq("id", orderId)
    .maybeSingle();

  if (fetchError) {
    console.error("[Supabase] Erreur lecture:", fetchError.message);
    return json(500, { error: "Erreur lecture base de données" });
  }

  if (existingOrder) {
    // Commande déjà payée → bloquer le double paiement
    if (["processing", "completed"].includes(existingOrder.status)) {
      console.warn(`[PayTech] Double paiement bloqué — orderId=${orderId} status=${existingOrder.status}`);
      return json(409, {
        error: `Cette commande a déjà été payée (statut : ${existingOrder.status})`,
      });
    }
    // Statut "pending", "awaiting_payment" ou "failed" → reprise autorisée
    console.log(`[Supabase] Reprise paiement — orderId=${orderId} status=${existingOrder.status}`);
  } else {
    // ── ÉTAPE 2 — Créer la commande en base (statut "pending") ───────────────
    const now = new Date().toISOString();
    const { error: insertError } = await supabase.from("orders").insert({
      id:          orderId,
      user_id:     userId,
      amount_eur:  amountEur,
      amount_fcfa: amountFcfa,
      currency:    "XOF",
      status:      "pending",
      items:       items,           // JSONB — lignes du panier
      created_at:  now,
      updated_at:  now,
    });

    if (insertError) {
      console.error("[Supabase] Erreur création commande:", insertError.message);
      return json(500, { error: "Impossible de créer la commande en base" });
    }
    console.log(`[Supabase] ✅ Commande créée — orderId=${orderId} montant=${amountFcfa} FCFA`);
  }

  // ── ÉTAPE 3 — Appel API PayTech ────────────────────────────────────────────
  const successUrl = `${FRONTEND_URL}/?payment=success&orderId=${encodeURIComponent(orderId)}`;
  const cancelUrl  = `${FRONTEND_URL}/?payment=cancel&orderId=${encodeURIComponent(orderId)}`;
  const ipnUrl     = `${FRONTEND_URL}/.netlify/functions/paytech-webhook`;

  const payload = {
    item_name:    `Commande NEXUS Market #${orderId}`,
    item_price:   amountFcfa,
    currency:     "XOF",
    ref_command:  orderId,
    command_name: "Paiement Mobile Money — NEXUS Market",
    env:          PAYTECH_ENV,
    ipn_url:      ipnUrl,
    success_url:  successUrl,
    cancel_url:   cancelUrl,
    custom_field: JSON.stringify({ orderId, source: "nexus-market", userId }),
  };

  let ptResponse;
  try {
    ptResponse = await fetch("https://paytech.sn/api/payment/request-payment", {
      method:  "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept":        "application/json",
        "API_KEY":       PAYTECH_API_KEY,
        "API_SECRET":    PAYTECH_SECRET_KEY,
      },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    console.error("[PayTech] Erreur réseau:", err.message);
    await safeUpdateOrder(supabase, orderId, {
      status:         "failed",
      failure_reason: "Erreur réseau vers PayTech",
    });
    return json(502, { error: "Impossible de joindre PayTech — vérifiez votre connexion" });
  }

  let ptData;
  try { ptData = await ptResponse.json(); }
  catch {
    console.error("[PayTech] Réponse non-JSON, status:", ptResponse.status);
    await safeUpdateOrder(supabase, orderId, {
      status:         "failed",
      failure_reason: "Réponse invalide de PayTech",
    });
    return json(502, { error: "Réponse invalide de PayTech" });
  }

  if (!ptResponse.ok || ptData.success !== 1) {
    const errors = Array.isArray(ptData.errors) ? ptData.errors.join(", ") : JSON.stringify(ptData);
    console.error("[PayTech] Échec:", errors);
    await safeUpdateOrder(supabase, orderId, {
      status:         "failed",
      failure_reason: errors,
    });
    return json(400, { error: `PayTech a refusé le paiement : ${errors}` });
  }

  // ── ÉTAPE 4 — Sauvegarder le token PayTech sur la commande ────────────────
  await safeUpdateOrder(supabase, orderId, {
    status:        "awaiting_payment", // l'utilisateur est en route vers PayTech
    paytech_token: ptData.token,
  });

  console.log(`[PayTech] ✅ Initialisé — orderId=${orderId} montant=${amountFcfa} FCFA token=${ptData.token}`);

  return json(200, {
    redirect_url: ptData.redirect_url,
    token:        ptData.token,
    orderId,
    amountFcfa,
  });
};

// ── Helpers ───────────────────────────────────────────────────────────────────

async function safeUpdateOrder(supabase, orderId, fields) {
  try {
    const { error } = await supabase
      .from("orders")
      .update({ ...fields, updated_at: new Date().toISOString() })
      .eq("id", orderId);
    if (error) console.warn(`[Supabase] safeUpdate échoué pour ${orderId}:`, error.message);
  } catch (err) {
    console.warn(`[Supabase] safeUpdate exception pour ${orderId}:`, err.message);
  }
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin":  "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}

function json(statusCode, body) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json", ...corsHeaders() },
    body: JSON.stringify(body),
  };
}
