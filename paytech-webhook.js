/**
 * Netlify Function — PayTech IPN Webhook
 * POST /.netlify/functions/paytech-webhook
 *
 * Variables d'environnement requises :
 *   PAYTECH_API_KEY      — clé API PayTech
 *   PAYTECH_SECRET_KEY   — clé secrète PayTech
 *   SUPABASE_URL         — URL du projet Supabase
 *   SUPABASE_SERVICE_KEY — clé service_role Supabase
 *
 * Statuts gérés :
 *   sale_complete  → "processing"  (paiement confirmé)
 *   sale_canceled  → "canceled"    (paiement annulé) ← NOUVEAU
 *
 * Cycle de vie d'une commande :
 *   pending → awaiting_payment → processing → completed
 *                             ↘ canceled
 *                             ↘ failed
 */

const crypto = require("crypto");
const { createClient } = require("@supabase/supabase-js");

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL ou SUPABASE_SERVICE_KEY manquant");
  return createClient(url, key, { auth: { persistSession: false } });
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Méthode non autorisée" };
  }

  // ── Lire les clés ───────────────────────────────────────────────────────────
  const PAYTECH_API_KEY    = process.env.PAYTECH_API_KEY;
  const PAYTECH_SECRET_KEY = process.env.PAYTECH_SECRET_KEY;

  if (!PAYTECH_API_KEY || !PAYTECH_SECRET_KEY) {
    console.error("[PayTech IPN] Variables d'environnement manquantes");
    return { statusCode: 500, body: "Configuration incomplète" };
  }

  // ── Parser les paramètres (application/x-www-form-urlencoded) ───────────────
  let params;
  try {
    params = Object.fromEntries(new URLSearchParams(event.body || ""));
  } catch {
    return { statusCode: 400, body: "Corps invalide" };
  }

  // ── Vérifier la signature PayTech ────────────────────────────────────────────
  const expectedApiHash    = crypto.createHash("sha256").update(PAYTECH_API_KEY).digest("hex");
  const expectedSecretHash = crypto.createHash("sha256").update(PAYTECH_SECRET_KEY).digest("hex");

  if (
    params.api_key_sha256    !== expectedApiHash ||
    params.api_secret_sha256 !== expectedSecretHash
  ) {
    console.warn("[PayTech IPN] ⚠️  Signature invalide — requête rejetée");
    return { statusCode: 403, body: "Signature invalide" };
  }

  const { ref_command, type_event, item_price, token, custom_field } = params;

  // ── Lire le custom_field pour récupérer userId si présent ────────────────────
  let customData = {};
  try { customData = custom_field ? JSON.parse(custom_field) : {}; }
  catch { console.warn("[PayTech IPN] custom_field non parsable:", custom_field); }

  console.log(
    `[PayTech IPN] Événement: ${type_event} | orderId: ${ref_command} | ` +
    `montant: ${item_price} FCFA | token: ${token}`
  );

  // ── Initialiser Supabase ────────────────────────────────────────────────────
  let supabase;
  try { supabase = getSupabase(); }
  catch (err) {
    console.error("[Supabase] Init impossible:", err.message);
    // On retourne 200 quand même pour que PayTech ne rappelle pas en boucle
    return { statusCode: 200, body: "OK" };
  }

  // ── Vérifier que la commande existe avant d'agir ────────────────────────────
  const { data: order, error: fetchError } = await supabase
    .from("orders")
    .select("id, status, amount_fcfa")
    .eq("id", ref_command)
    .maybeSingle();

  if (fetchError) {
    console.error("[Supabase] Erreur lecture commande:", fetchError.message);
    return { statusCode: 200, body: "OK" }; // 200 pour éviter le retry PayTech
  }

  if (!order) {
    console.error(`[PayTech IPN] ❌ Commande introuvable en base — orderId=${ref_command}`);
    // On retourne 200 pour éviter que PayTech rappelle indéfiniment
    return { statusCode: 200, body: "OK" };
  }

  // ── Traiter l'événement ──────────────────────────────────────────────────────
  if (type_event === "sale_complete") {
    await handleSaleComplete({ supabase, order, token, item_price, ref_command });

  } else if (type_event === "sale_canceled") {
    await handleSaleCanceled({ supabase, order, token, ref_command, customData });

  } else {
    // Événement inconnu — logué mais non bloquant
    console.warn(`[PayTech IPN] ⚠️  Événement non géré : ${type_event} — orderId=${ref_command}`);
  }

  // PayTech attend un HTTP 200 pour confirmer la réception
  return { statusCode: 200, body: "OK" };
};

// ── Handlers métier ───────────────────────────────────────────────────────────

/**
 * Paiement confirmé par PayTech.
 * - Passe la commande en "processing"
 * - Garde une trace du token et du montant réel encaissé
 * - Ignore si la commande est déjà dans un état final (idempotence)
 */
async function handleSaleComplete({ supabase, order, token, item_price, ref_command }) {
  // Idempotence — si déjà "processing" ou "completed", ne rien faire
  if (["processing", "completed"].includes(order.status)) {
    console.log(`[PayTech IPN] ℹ️  Commande déjà traitée (${order.status}) — orderId=${ref_command}`);
    return;
  }

  const { error } = await supabase
    .from("orders")
    .update({
      status:             "processing",
      paytech_token:      token,
      paid_amount_fcfa:   Number(item_price) || order.amount_fcfa,
      paid_at:            new Date().toISOString(),
      updated_at:         new Date().toISOString(),
      canceled_at:        null,   // effacer une éventuelle annulation précédente
      failure_reason:     null,
    })
    .eq("id", ref_command);

  if (error) {
    console.error(`[Supabase] Erreur mise à jour "processing" — orderId=${ref_command}:`, error.message);
  } else {
    console.log(`[PayTech IPN] ✅ Paiement confirmé — commande ${ref_command} → processing`);
    // 👉 Ici : déclencher email de confirmation, réduire stock, notif push, etc.
  }
}

/**
 * Paiement annulé par l'utilisateur ou expiré.
 * - Passe la commande en "canceled"
 * - Enregistre l'heure d'annulation
 * - N'écrase pas une commande déjà "processing" ou "completed"
 */
async function handleSaleCanceled({ supabase, order, token, ref_command, customData }) {
  // Sécurité : ne jamais annuler une commande déjà payée
  if (["processing", "completed"].includes(order.status)) {
    console.warn(
      `[PayTech IPN] ⚠️  Tentative d'annulation sur commande déjà payée ` +
      `(${order.status}) — orderId=${ref_command}. Ignoré.`
    );
    return;
  }

  // Idempotence — déjà annulée
  if (order.status === "canceled") {
    console.log(`[PayTech IPN] ℹ️  Commande déjà annulée — orderId=${ref_command}`);
    return;
  }

  const { error } = await supabase
    .from("orders")
    .update({
      status:       "canceled",
      paytech_token: token,
      canceled_at:  new Date().toISOString(),
      updated_at:   new Date().toISOString(),
    })
    .eq("id", ref_command);

  if (error) {
    console.error(`[Supabase] Erreur mise à jour "canceled" — orderId=${ref_command}:`, error.message);
  } else {
    console.log(`[PayTech IPN] ❌ Paiement annulé — commande ${ref_command} → canceled`);
    // 👉 Ici : remettre les articles en stock, notifier l'utilisateur, etc.
    // Exemple avec userId depuis custom_field :
    //   await notifyUserCancellation(customData.userId, ref_command);
  }
}
