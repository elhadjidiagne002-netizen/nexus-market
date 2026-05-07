/**
 * functions/paytech-webhook.js
 * ──────────────────────────────────────────────────────────────────────────
 * POST /paytech-webhook — IPN PayTech (confirmation de paiement commande)
 *
 * Adaptation Netlify → Cloudflare :
 *   • Le module Node.js `crypto` est remplacé par Web Crypto (crypto.subtle).
 *   • L'intégration Supabase (commentée dans l'original) est activée et
 *     correctement intégrée avec la gestion d'env Cloudflare.
 *   • process.env → env
 *
 * Variables d'environnement Cloudflare :
 *   PAYTECH_API_KEY      — Clé API PayTech
 *   PAYTECH_SECRET_KEY   — Secret PayTech
 *   SUPABASE_URL         — URL Supabase (optionnel mais recommandé)
 *   SUPABASE_SERVICE_KEY — Clé service_role (optionnel mais recommandé)
 */

import { createClient } from "@supabase/supabase-js";

// ── SHA-256 via Web Crypto API ────────────────────────────────────────────
async function sha256hex(str) {
  const encoded = new TextEncoder().encode(str);
  const hashBuf = await crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(hashBuf))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function onRequestPost(context) {
  const { request, env } = context;

  const { PAYTECH_API_KEY, PAYTECH_SECRET_KEY, SUPABASE_URL, SUPABASE_SERVICE_KEY } = env;

  if (!PAYTECH_API_KEY || !PAYTECH_SECRET_KEY) {
    console.error("[PayTech IPN] Variables d'env manquantes");
    return new Response("Configuration incomplète", { status: 500 });
  }

  // ── Parser le body (application/x-www-form-urlencoded) ───────────────────
  const rawBody = await request.text();
  let params = {};
  try {
    params = Object.fromEntries(new URLSearchParams(rawBody || ""));
  } catch {
    return new Response("Corps invalide", { status: 400 });
  }

  // ── Vérifier la signature PayTech ────────────────────────────────────────
  // PayTech envoie api_key_sha256 et api_secret_sha256 dans le body
  const expectedApiHash    = await sha256hex(PAYTECH_API_KEY);
  const expectedSecretHash = await sha256hex(PAYTECH_SECRET_KEY);

  if (
    params.api_key_sha256    !== expectedApiHash ||
    params.api_secret_sha256 !== expectedSecretHash
  ) {
    console.warn("[PayTech IPN] ⚠️  Signature invalide — requête rejetée");
    return new Response("Signature invalide", { status: 403 });
  }

  const { ref_command, type_event, item_price, token } = params;
  console.log(`[PayTech IPN] ${type_event} | orderId: ${ref_command} | ${item_price} FCFA | token: ${token}`);

  // ── Traitement des événements ─────────────────────────────────────────────
  if (type_event === "sale_complete") {
    console.log(`[PayTech IPN] ✅ Paiement confirmé — commande ${ref_command}`);

    // Mise à jour Supabase si les variables sont disponibles
    if (SUPABASE_URL && SUPABASE_SERVICE_KEY) {
      try {
        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
          auth: { autoRefreshToken: false, persistSession: false },
        });

        const { error: orderErr } = await supabase
          .from("orders")
          .update({ status: "processing", paytech_token: token })
          .eq("id", ref_command);

        if (orderErr) {
          console.error("[PayTech IPN] Supabase update error:", orderErr.message);
        } else {
          console.log(`[PayTech IPN] Commande ${ref_command} → processing`);
        }

        // Notification à l'acheteur
        const { data: order } = await supabase
          .from("orders")
          .select("user_id, total")
          .eq("id", ref_command)
          .single();

        if (order?.user_id) {
          await supabase.from("notifications").insert({
            user_id: order.user_id,
            type:    "payment",
            title:   "✅ Paiement confirmé",
            message: `Votre paiement de ${Number(item_price).toLocaleString("fr-FR")} FCFA a été reçu. Votre commande est en cours de traitement.`,
            read:    false,
          }).catch(e => console.warn("[PayTech IPN] notif error:", e.message));
        }

        // Créditer les points de fidélité (si amountEur disponible)
        if (order?.user_id && order?.total) {
          const loyaltyUrl = `${env.SITE_URL || ""}/functions/loyalty`;
          // Appel interne async (fire & forget, ne bloque pas la réponse PayTech)
          context.waitUntil(
            fetch(loyaltyUrl, {
              method:  "POST",
              headers: { "Content-Type": "application/json" },
              body:    JSON.stringify({
                userId:    order.user_id,
                amountEur: order.total,
                reason:    "order",
                orderId:   ref_command,
                note:      `Commande confirmée — ${ref_command}`,
              }),
            }).catch(e => console.warn("[PayTech IPN] loyalty call failed:", e.message))
          );
        }

      } catch (e) {
        console.error("[PayTech IPN] Erreur Supabase:", e.message);
      }
    }

  } else if (type_event === "sale_canceled") {
    console.log(`[PayTech IPN] ❌ Paiement annulé — commande ${ref_command}`);

    if (SUPABASE_URL && SUPABASE_SERVICE_KEY) {
      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      await supabase
        .from("orders")
        .update({ status: "cancelled" })
        .eq("id", ref_command)
        .catch(e => console.warn("[PayTech IPN] cancel update:", e.message));
    }

  } else {
    console.log(`[PayTech IPN] ℹ️  Événement non géré : ${type_event}`);
  }

  // PayTech attend un HTTP 200 pour confirmer la réception
  return new Response("OK", { status: 200 });
}
