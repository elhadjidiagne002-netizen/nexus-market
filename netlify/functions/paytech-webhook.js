/**
 * Netlify Function — PayTech IPN Webhook
 * POST /.netlify/functions/paytech-webhook
 * (aussi accessible via /api/payments/webhook grâce au redirect netlify.toml)
 *
 * PayTech appelle cette URL après confirmation de paiement.
 * La signature est vérifiée via SHA-256 des clés API.
 *
 * Variables d'environnement requises :
 *   PAYTECH_API_KEY    — clé API PayTech
 *   PAYTECH_SECRET_KEY — clé secrète PayTech
 *   SUPABASE_URL       — URL du projet Supabase (optionnel — pour mise à jour statut)
 *   SUPABASE_SERVICE_KEY — clé service Supabase (optionnel)
 */

const crypto = require("crypto");

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Méthode non autorisée" };
  }

  // ── Lire les clés ────────────────────────────────────────────────────────
  const PAYTECH_API_KEY    = process.env.PAYTECH_API_KEY;
  const PAYTECH_SECRET_KEY = process.env.PAYTECH_SECRET_KEY;

  if (!PAYTECH_API_KEY || !PAYTECH_SECRET_KEY) {
    console.error("[PayTech IPN] Variables d'environnement manquantes");
    return { statusCode: 500, body: "Configuration incomplète" };
  }

  // ── Parser les paramètres (application/x-www-form-urlencoded) ────────────
  let params;
  try {
    params = Object.fromEntries(new URLSearchParams(event.body || ""));
  } catch {
    return { statusCode: 400, body: "Corps invalide" };
  }

  // ── Vérifier la signature PayTech ─────────────────────────────────────────
  const expectedApiHash    = crypto.createHash("sha256").update(PAYTECH_API_KEY).digest("hex");
  const expectedSecretHash = crypto.createHash("sha256").update(PAYTECH_SECRET_KEY).digest("hex");

  if (
    params.api_key_sha256    !== expectedApiHash ||
    params.api_secret_sha256 !== expectedSecretHash
  ) {
    console.warn("[PayTech IPN] ⚠️  Signature invalide — requête rejetée");
    return { statusCode: 403, body: "Signature invalide" };
  }

  const { ref_command, type_event, item_price, token } = params;
  console.log(`[PayTech IPN] Événement: ${type_event} | orderId: ${ref_command} | montant: ${item_price} FCFA | token: ${token}`);

  // ── Traiter l'événement ───────────────────────────────────────────────────
  if (type_event === "sale_complete") {
    console.log(`[PayTech IPN] ✅ Paiement confirmé — commande ${ref_command}`);

    // TODO : mettre à jour le statut dans Supabase
    // Décommentez le bloc ci-dessous si vous avez SUPABASE_URL et SUPABASE_SERVICE_KEY
    //
    // const { createClient } = require("@supabase/supabase-js");
    // const supabase = createClient(
    //   process.env.SUPABASE_URL,
    //   process.env.SUPABASE_SERVICE_KEY
    // );
    // await supabase
    //   .from("orders")
    //   .update({ status: "processing", paytech_token: token })
    //   .eq("id", ref_command);

  } else if (type_event === "sale_canceled") {
    console.log(`[PayTech IPN] ❌ Paiement annulé — commande ${ref_command}`);

  } else {
    console.log(`[PayTech IPN] ℹ️  Événement non géré : ${type_event}`);
  }

  // PayTech attend un HTTP 200 pour confirmer la réception
  return { statusCode: 200, body: "OK" };
};
