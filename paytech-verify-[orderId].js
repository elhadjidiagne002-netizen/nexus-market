// ── GET /api/payments/paytech/verify/:orderId ──────────────────────────────
// Interroge Supabase pour savoir si une commande a été payée.
// Cloudflare Pages Function — runtime Workers (V8, pas Node.js).
//
// Réponse 200 :
//   { paid: bool, failed: bool, reason?: string, amount?: number }
//
// ⚠️  paid=true UNIQUEMENT après réception et vérification de l'IPN PayTech.
//     Jamais sur la simple URL de retour (forgeable).

export async function onRequestGet(context) {
  const { params, env } = context;

  const orderId = params.orderId;
  const SB_URL  = env.SUPABASE_URL;
  const SB_KEY  = env.SUPABASE_SERVICE_KEY;

  if (!orderId) {
    return jsonResponse({ error: "orderId manquant" }, 400);
  }

  if (!SB_URL || !SB_KEY) {
    return jsonResponse({ paid: false, failed: false, reason: "Supabase non configuré" });
  }

  // ── Lecture en base ───────────────────────────────────────────────────────
  let order = null;
  try {
    const res = await fetch(
      `${SB_URL}/rest/v1/orders?id=eq.${encodeURIComponent(orderId)}&select=status,paid_amount_fcfa,failure_reason`,
      {
        headers: {
          "apikey":        SB_KEY,
          "Authorization": `Bearer ${SB_KEY}`,
        },
      }
    );
    if (!res.ok) {
      return jsonResponse({ paid: false, failed: false, reason: "Erreur Supabase" });
    }
    const data = await res.json();
    order = Array.isArray(data) ? data[0] : null;
  } catch (e) {
    return jsonResponse({ paid: false, failed: false, reason: e.message });
  }

  if (!order) {
    return jsonResponse({ paid: false, failed: false, reason: "Commande introuvable" });
  }

  return jsonResponse({
    paid:   order.status === "paid",
    failed: ["cancelled", "failed"].includes(order.status),
    reason: order.failure_reason || null,
    amount: order.paid_amount_fcfa || null,
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────
function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type":                "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
