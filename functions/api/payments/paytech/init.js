// ── POST /api/payments/paytech/init ────────────────────────────────────────
// Initialise un paiement PayTech (Wave / Orange Money / Free Money).
// Cloudflare Pages Function — runtime Workers (V8, pas Node.js).
//
// Variables d'environnement requises (Cloudflare Pages → Settings → Variables) :
//   PAYTECH_API_KEY     — clé API PayTech
//   PAYTECH_API_SECRET  — clé secrète PayTech
//   PAYTECH_ENV         — "test" | "prod"  (défaut : "test")
//   SUPABASE_URL        — ex: https://xxxx.supabase.co
//   SUPABASE_SERVICE_KEY — clé service_role Supabase (Dashboard → Settings → API)
//
// Corps attendu (JSON) :
//   { orderId, amountFcfa, itemName, successUrl, cancelUrl }
//
// Réponse 200 :
//   { redirect_url, token, ref_command }

export async function onRequestPost(context) {
  const { request, env } = context;

  // ── Variables d'env ───────────────────────────────────────────────────────
  const API_KEY    = env.PAYTECH_API_KEY;
  const API_SECRET = env.PAYTECH_API_SECRET;
  const PT_ENV     = env.PAYTECH_ENV || "test";
  const SB_URL     = env.SUPABASE_URL;
  const SB_KEY     = env.SUPABASE_SERVICE_KEY;

  if (!API_KEY || !API_SECRET) {
    return jsonResponse({ error: "PayTech non configuré côté serveur" }, 500);
  }

  // ── Corps de la requête ───────────────────────────────────────────────────
  let body;
  try { body = await request.json(); }
  catch { return jsonResponse({ error: "Corps JSON invalide" }, 400); }

  const { orderId, amountFcfa, itemName, successUrl, cancelUrl } = body || {};
  if (!orderId || !amountFcfa) {
    return jsonResponse({ error: "orderId et amountFcfa sont requis" }, 400);
  }

  // ── IPN URL — même origin que le site ────────────────────────────────────
  const origin = new URL(request.url).origin;
  const ipnUrl = `${origin}/api/payments/paytech/ipn`;

  // ── Appel API PayTech ─────────────────────────────────────────────────────
  let ptRes;
  try {
    ptRes = await fetch("https://paytech.sn/api/payment/request-payment", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "API_KEY":       API_KEY,
        "API_SECRET":    API_SECRET,
      },
      body: JSON.stringify({
        item_name:    itemName || `Commande NEXUS #${orderId}`,
        item_price:   amountFcfa,
        currency:     "XOF",
        ref_command:  orderId,
        command_name: `NEXUS Market — Commande #${orderId}`,
        env:          PT_ENV,
        ipn_url:      ipnUrl,
        success_url:  successUrl,
        cancel_url:   cancelUrl,
        custom_field: JSON.stringify({ source: "nexus_market", orderId }),
      }),
    });
  } catch (e) {
    return jsonResponse({ error: `Réseau PayTech inaccessible : ${e.message}` }, 502);
  }

  let ptData;
  try { ptData = await ptRes.json(); }
  catch { return jsonResponse({ error: "Réponse PayTech illisible" }, 502); }

  if (!ptRes.ok || ptData.success !== 1) {
    return jsonResponse(
      { error: ptData.message || ptData.error || "PayTech a refusé la demande" },
      400
    );
  }

  // ── Persister le token PayTech dans Supabase ──────────────────────────────
  if (SB_URL && SB_KEY && ptData.token) {
    try {
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
            paytech_token: ptData.token,
            status:        "awaiting_payment",
          }),
        }
      );
    } catch (e) {
      // Non-bloquant — on continue même si Supabase échoue
      console.error("[PayTech init] Supabase PATCH échoué :", e.message);
    }
  }

  return jsonResponse({
    redirect_url: ptData.redirect_url,
    token:        ptData.token,
    ref_command:  orderId,
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
