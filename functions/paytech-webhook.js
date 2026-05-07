/**
 * functions/paytech-webhook.js
 * IPN PayTech – Confirme ou annule une commande
 */
import { createClient } from "@supabase/supabase-js";

async function sha256hex(str) {
  const encoded = new TextEncoder().encode(str);
  const hashBuf = await crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(hashBuf))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function onRequestPost(context) {
  const { request, env } = context;

  // Vérification des variables critiques
  const { PAYTECH_API_KEY, PAYTECH_SECRET_KEY, SUPABASE_URL, SUPABASE_SERVICE_KEY } = env;
  if (!PAYTECH_API_KEY || !PAYTECH_SECRET_KEY) {
    console.error("[PayTech IPN] Clés manquantes");
    return new Response("Configuration incomplete", { status: 500 });
  }

  // Lecture du body (form-urlencoded)
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

  // Initialisation Supabase si configurée
  const sb = SUPABASE_URL && SUPABASE_SERVICE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
        auth: { autoRefreshToken: false, persistSession: false },
      })
    : null;

  try {
    if (type_event === "sale_complete") {
      console.log(`[PayTech IPN] Paiement confirmé pour la commande ${ref_command}`);

      if (sb) {
        // Mise à jour commande → "processing"
        const { error: orderErr } = await sb
          .from("orders")
          .update({ status: "processing", paytech_token: token })
          .eq("id", ref_command);

        if (orderErr) {
          console.error("[PayTech IPN] Erreur mise à jour commande:", orderErr.message);
        } else {
          // Récupérer l'acheteur et le total pour notification et fidélité
          const { data: order } = await sb
            .from("orders")
            .select("user_id, total")
            .eq("id", ref_command)
            .single();

          if (order?.user_id) {
            // Notification
            await sb.from("notifications").insert({
              user_id: order.user_id,
              type: "payment",
              title: "✅ Paiement confirmé",
              message: `Votre paiement de ${Number(item_price).toLocaleString("fr-FR")} FCFA a été reçu. Commande en cours de traitement.`,
              read: false,
            }).catch(e => console.warn("[PayTech IPN] notification error:", e.message));

            // Points de fidélité (si total > 0) – appel interne à /functions/loyalty
            if (order.total && env.SITE_URL) {
              context.waitUntil(
                fetch(`${env.SITE_URL}/functions/loyalty`, {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`, // service key for internal call
                  },
                  body: JSON.stringify({
                    userId: order.user_id,
                    amountEur: order.total,
                    reason: "order",
                    orderId: ref_command,
                    note: `Commande #${ref_command}`,
                  }),
                }).catch(e => console.warn("[PayTech IPN] loyalty call failed:", e.message))
              );
            }
          }
        }
      }

    } else if (type_event === "sale_canceled") {
      console.log(`[PayTech IPN] Paiement annulé pour ${ref_command}`);
      if (sb) {
        await sb.from("orders")
          .update({ status: "cancelled" })
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
