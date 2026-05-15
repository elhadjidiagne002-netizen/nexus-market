// ── POST /api/payments/paytech/ipn ─────────────────────────────────────────
// Reçoit la notification de paiement (IPN) envoyée par PayTech après
// validation du paiement Wave / Orange Money / Free Money.
// Cloudflare Pages Function — runtime Workers (V8, pas Node.js).
//
// Sécurité : vérifie que sha256(API_KEY) === api_key_sha256
//            ET que sha256(API_SECRET) === api_secret_sha256
// → Toute IPN dont le hash ne correspond pas est rejetée (401).
//
// Variables d'environnement requises :
//   PAYTECH_API_KEY     / PAYTECH_API_SECRET
//   SUPABASE_URL        / SUPABASE_SERVICE_KEY

export async function onRequestPost(context) {
  const { request, env } = context;

  const API_KEY    = env.PAYTECH_API_KEY;
  const API_SECRET = env.PAYTECH_API_SECRET;
  const SB_URL     = env.SUPABASE_URL;
  const SB_KEY     = env.SUPABASE_SERVICE_KEY;

  // ── Lire le corps (JSON ou form-encoded selon config PayTech) ─────────────
  const ct = request.headers.get("content-type") || "";
  let body = {};
  try {
    if (ct.includes("application/json")) {
      body = await request.json();
    } else {
      const text = await request.text();
      body = Object.fromEntries(new URLSearchParams(text));
    }
  } catch {
    return new Response("Bad Request", { status: 400 });
  }

  // ── Vérification HMAC ─────────────────────────────────────────────────────
  const expectedKeyHash    = await sha256hex(API_KEY    || "");
  const expectedSecretHash = await sha256hex(API_SECRET || "");

  if (
    body.api_key_sha256    !== expectedKeyHash ||
    body.api_secret_sha256 !== expectedSecretHash
  ) {
    console.error("[PayTech IPN] Hash invalide — IPN rejetée");
    return new Response("Unauthorized", { status: 401 });
  }

  // ── Traitement de l'événement ─────────────────────────────────────────────
  const orderId    = body.ref_command;
  const typeEvent  = body.type_event;
  const amountPaid = parseInt(body.item_price) || 0;

  if (!orderId) {
    return new Response("Missing ref_command", { status: 400 });
  }

  if (typeEvent === "sale_complete") {
    if (SB_URL && SB_KEY) {
      try {
        const res = await fetch(
          `${SB_URL}/rest/v1/orders?id=eq.${encodeURIComponent(orderId)}`,
          {
            method: "PATCH",
            headers: {
              "Content-Type":  "application/json",
              "apikey":        SB_KEY,
              "Authorization": `Bearer ${SB_KEY}`,
              "Prefer":        "return=minimal",
            },
            body: JSON.stringify({
              status:           "paid",
              paid_amount_fcfa: amountPaid,
              paid_at:          new Date().toISOString(),
              updated_at:       new Date().toISOString(),
            }),
          }
        );
        if (!res.ok) {
          const txt = await res.text();
          console.error("[PayTech IPN] Supabase PATCH erreur :", res.status, txt);
        } else {
          console.log(`[PayTech IPN] ✅ Commande ${orderId} marquée paid (${amountPaid} FCFA)`);
        }
      } catch (e) {
        console.error("[PayTech IPN] Supabase exception :", e.message);
      }
    }
  } else if (typeEvent === "sale_canceled") {
    if (SB_URL && SB_KEY) {
      await fetch(
        `${SB_URL}/rest/v1/orders?id=eq.${encodeURIComponent(orderId)}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type":  "application/json",
            "apikey":        SB_KEY,
            "Authorization": `Bearer ${SB_KEY}`,
            "Prefer":        "return=minimal",
          },
          body: JSON.stringify({
            status:         "cancelled",
            failure_reason: "Annulé via PayTech",
            canceled_at:    new Date().toISOString(),
            updated_at:     new Date().toISOString(),
          }),
        }
      ).catch(e => console.error("[PayTech IPN] Cancel PATCH :", e.message));
    }
  }

  // PayTech exige un 200 "OK" pour confirmer réception
  return new Response("OK", { status: 200 });
}

// ── Helpers ───────────────────────────────────────────────────────────────
async function sha256hex(str) {
  const data   = new TextEncoder().encode(str);
  const buffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buffer))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}
