/**
 * functions/paytech-webhook.js
 * IPN PayTech – Confirme ou annule une commande
 */
import { createClient } from "@supabase/supabase-js";
import { sendEventEmail } from "./api/_lib/notify.js";

// Multiplicateur de points par défaut (tier Bronze)
const POINTS_PER_EURO = 10;
// Conversion FCFA → EUR (la table orders stocke `total` en FCFA ; les points
// fidélité sont calculés par euro, cf. functions/loyalty.js).
const EUR_TO_FCFA = 655.957;

async function sha256hex(str) {
  const encoded = new TextEncoder().encode(str);
  const hashBuf = await crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(hashBuf))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function onRequestPost(context) {
  const { request, env } = context;

  const { PAYTECH_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_KEY } = env;
  // Accepte les deux conventions de nommage du secret présentes dans le projet.
  const PAYTECH_SECRET_KEY = env.PAYTECH_SECRET_KEY || env.PAYTECH_API_SECRET;
  if (!PAYTECH_API_KEY || !PAYTECH_SECRET_KEY) {
    console.error("[PayTech IPN] Clés manquantes");
    return new Response("Configuration incomplete", { status: 500 });
  }

  const rawBody = await request.text();
  let params;
  try {
    params = Object.fromEntries(new URLSearchParams(rawBody || ""));
  } catch {
    return new Response("Invalid body", { status: 400 });
  }

  // Vérification de la signature
  const expectedApiHash = await sha256hex(PAYTECH_API_KEY);
  const expectedSecretHash = await sha256hex(PAYTECH_SECRET_KEY);
  if (
    params.api_key_sha256 !== expectedApiHash ||
    params.api_secret_sha256 !== expectedSecretHash
  ) {
    console.warn("[PayTech IPN] Signature invalide");
    return new Response("Forbidden", { status: 403 });
  }

  const { ref_command, type_event, item_price, token } = params;
  console.log(`[PayTech IPN] ${type_event} cmd=${ref_command} price=${item_price} token=${token}`);

  const sb = SUPABASE_URL && SUPABASE_SERVICE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
        auth: { autoRefreshToken: false, persistSession: false },
      })
    : null;

  try {
    if (type_event === "sale_complete") {
      console.log(`[PayTech IPN] Paiement confirmé pour la commande ${ref_command}`);

      if (sb) {
        // [FIX] Colonnes conformes au schéma orders :
        //  - persistance du payment_status='paid' (auparavant absent → la commande
        //    restait 'pending' côté paiement même après confirmation PayTech).
        //  - `paytech_token` n'existe pas → on stocke le token dans mobile_money_ref.
        //  - status ∈ {pending_payment,processing,...} ; payment_method ∈ {card,mobile}.
        const now = new Date().toISOString();
        // [IDEMPOTENCE] L'IPN PayTech n'a pas d'anti-rejeu réel (hash api_key/secret
        // constants) et PayTech peut retenter l'appel → on ne transitionne vers 'paid'
        // QU'UNE FOIS (garde `.neq('payment_status','paid')`). Sans ça, les effets de
        // bord ci-dessous (dont le CRÉDIT DES POINTS DE FIDÉLITÉ) seraient rejoués à
        // chaque appel → multi-crédit. `.select('id')` nous dit si la transition a eu lieu.
        const { data: updatedRows, error: orderErr } = await sb
          .from("orders")
          .update({
            status: "processing",
            payment_status: "paid",
            payment_method: "mobile",
            mobile_money_ref: token,
            processing_at: now,
            updated_at: now,
          })
          .eq("id", ref_command)
          .neq("payment_status", "paid")
          .select("id");

        if (orderErr) {
          console.error("[PayTech IPN] Erreur mise à jour commande:", orderErr.message);
        } else if (!updatedRows || updatedRows.length === 0) {
          console.log("[PayTech IPN] Commande déjà payée — effets de bord ignorés (idempotent).");
        } else {
          // [FIX] La colonne s'appelle buyer_id dans le schéma orders
          // (et non user_id — cf. saveOrder dans index.html). On lit aussi `total`
          // (et non amount_eur, colonne inexistante).
          const { data: order } = await sb
            .from("orders")
            .select("buyer_id, total, buyer_email, buyer_name")
            .eq("id", ref_command)
            .single();

          if (order?.buyer_id) {
            // Notification (type ∈ {order,offer,message,return,vendor,system,dispute})
            await sb.from("notifications").insert({
              user_id: order.buyer_id,
              type: "order",
              title: "✅ Paiement confirmé",
              message: `Votre paiement de ${Number(item_price).toLocaleString("fr-FR")} FCFA a été reçu. Commande en cours de traitement.`,
              read: false,
              link: `/?order=${ref_command}`,
            }).catch(e => console.warn("[PayTech IPN] notification error:", e.message));

            // [EMAIL] Paiement reçu (centre de notifications)
            if (order.buyer_email) {
              context.waitUntil(
                sendEventEmail(env, "payment_received", order.buyer_email, {
                  buyer_name: order.buyer_name || "Client",
                  order_id:   ref_command,
                  // order.total est en EUR → affichage FCFA = round(total × 655.957).
                  // Repli sur item_price (déjà en FCFA, fourni par PayTech).
                  total:      (order.total ? Math.round(Number(order.total) * EUR_TO_FCFA) : Number(item_price) || 0).toLocaleString("fr-FR"),
                  _userId:    order.buyer_id || null,
                  _orderId:   ref_command,
                }).catch(e => console.warn("[PayTech IPN] email:", e.message))
              );
            }

            // [PUSH] Envoyer la notification push au buyer
            context.waitUntil(
              fetch(new URL("/push-send", request.url).origin + "/push-send", {
                method: "POST",
                headers: { "Content-Type": "application/json", "X-Internal-Secret": env.INTERNAL_API_SECRET || env.CRON_SECRET || env.SUPABASE_SERVICE_KEY || "" },
                body: JSON.stringify({
                  userId: order.buyer_id,
                  title: "✅ Paiement confirmé",
                  body: `Votre paiement de ${Number(item_price).toLocaleString("fr-FR")} FCFA est reçu.`,
                  url: `/?order=${ref_command}`,
                }),
              }).catch(e => console.warn("[PayTech IPN] push error:", e.message))
            );

            // [FIX] L'appel HTTP interne à /functions/loyalty passait
            // SUPABASE_SERVICE_KEY comme Bearer token, mais loyalty.js appelle
            // sb.auth.getUser() qui ne reconnaît pas la service key comme JWT
            // utilisateur → la fonction échouait systématiquement (401).
            // Solution : appel direct au RPC Supabase avec la service key,
            // ce qui évite la couche HTTP et le problème d'authentification.
            if (order.total > 0) {
              // orders.total est déjà en EUR (convention tranchée, cf. CLAUDE.md)
              // → pas de conversion ; les points = EUR × POINTS_PER_EURO.
              const amountEur = Number(order.total) || 0;
              context.waitUntil(
                sb.rpc("add_loyalty_points", {
                  p_user_id: order.buyer_id,
                  p_delta: Math.floor(amountEur * POINTS_PER_EURO),
                  p_reason: "order",
                  p_order_id: ref_command,
                  p_note: `Commande #${ref_command}`,
                }).then(({ error }) => {
                  if (error) console.warn("[PayTech IPN] loyalty RPC error:", error.message);
                  else console.log(`[PayTech IPN] Points fidélité crédités pour ${order.buyer_id}`);
                })
              );
            }
          }
        }
      }

    } else if (type_event === "sale_canceled") {
      console.log(`[PayTech IPN] Paiement annulé pour ${ref_command}`);
      if (sb) {
        // Persister l'échec de paiement en plus de l'annulation de commande.
        const now = new Date().toISOString();
        await sb.from("orders")
          .update({
            status: "cancelled",
            payment_status: "failed",
            cancel_reason: "Paiement PayTech annulé",
            cancelled_at: now,
            updated_at: now,
          })
          .eq("id", ref_command)
          .catch(e => console.error("[PayTech IPN] cancel update error:", e.message));
      }
    } else {
      console.log(`[PayTech IPN] Événement non géré : ${type_event}`);
    }
  } catch (e) {
    console.error("[PayTech IPN] Erreur générale:", e.message);
  }

  return new Response("OK", { status: 200 });
}
