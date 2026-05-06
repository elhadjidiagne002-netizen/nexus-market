// /.netlify/functions/payout-request
// POST → Crée une demande de retrait vendeur via PayTech Transfer
//
// Body attendu :
//   { amount, method, provider, destination }
//   amount en XOF (FCFA)
//   method : "mobile" | "bank"
//   provider : "orange" | "wave" | "free" (si mobile)
//   destination : numéro de téléphone ou IBAN
//
// Auth : Bearer {supabase_jwt} dans Authorization

const { createClient } = require("@supabase/supabase-js");
const https            = require("https");

const SUPABASE_URL      = process.env.SUPABASE_URL      || "https://pqcqbstbdujzaclsiosv.supabase.co";
const SUPABASE_SERVICE  = process.env.SUPABASE_SERVICE_KEY;
const PAYTECH_API_KEY   = process.env.PAYTECH_API_KEY;
const PAYTECH_API_SECRET= process.env.PAYTECH_API_SECRET;
const PAYTECH_ENV       = process.env.PAYTECH_ENV       || "prod";
const SITE_URL          = process.env.SITE_URL          || "https://nexus-market-md360.netlify.app";

// Commission NEXUS prélevée sur les ventes (15 %)
const NEXUS_COMMISSION  = 0.15;
// Minimum de retrait : 1 000 FCFA
const MIN_PAYOUT_XOF    = 1000;

// ── Opérateurs mobile money reconnus ─────────────────────────────────────────
const PROVIDER_MAP = {
  orange: "Orange Money",
  wave:   "Wave",
  free:   "Free Money",
};

// ── Headers CORS ──────────────────────────────────────────────────────────────
function cors() {
  return {
    "Access-Control-Allow-Origin":  "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}

// ── Appel HTTPS → PayTech ─────────────────────────────────────────────────────
function paytechTransfer(payload) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const options = {
      hostname: "paytech.sn",
      path:     "/api/payment/request-payment",
      method:   "POST",
      headers: {
        "Content-Type":   "application/json",
        "Content-Length": Buffer.byteLength(body),
        "API_KEY":        PAYTECH_API_KEY,
        "API_SECRET":     PAYTECH_API_SECRET,
      },
    };
    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => { data += chunk; });
      res.on("end",  () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch (_) { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

// ── Handler principal ─────────────────────────────────────────────────────────
exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: cors(), body: "" };
  }
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers: cors(), body: JSON.stringify({ error: "Method not allowed" }) };
  }

  // ── Vérification des variables d'env ──────────────────────────────────────
  if (!SUPABASE_SERVICE || !PAYTECH_API_KEY || !PAYTECH_API_SECRET) {
    console.error("[payout-request] Variables d'env manquantes");
    return {
      statusCode: 503,
      headers: { ...cors(), "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Configuration serveur incomplète (env vars manquantes)" }),
    };
  }

  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // ── Authentification du vendeur ───────────────────────────────────────────
  const authHeader = event.headers?.authorization || event.headers?.Authorization || "";
  if (!authHeader.startsWith("Bearer ")) {
    return { statusCode: 401, headers: cors(), body: JSON.stringify({ error: "Token manquant" }) };
  }
  const { data: { user }, error: authErr } = await sb.auth.getUser(authHeader.slice(7));
  if (authErr || !user) {
    return { statusCode: 401, headers: cors(), body: JSON.stringify({ error: "Token invalide ou expiré" }) };
  }

  // ── Lecture du body ───────────────────────────────────────────────────────
  let payload;
  try { payload = JSON.parse(event.body || "{}"); } catch (_) {
    return { statusCode: 400, headers: cors(), body: JSON.stringify({ error: "JSON invalide" }) };
  }

  const { amount, method, provider, destination } = payload;

  // ── Validations ───────────────────────────────────────────────────────────
  if (!amount || typeof amount !== "number" || amount < MIN_PAYOUT_XOF) {
    return { statusCode: 400, headers: cors(), body: JSON.stringify({ error: `Montant minimum : ${MIN_PAYOUT_XOF.toLocaleString("fr-FR")} FCFA` }) };
  }
  if (!method || !["mobile", "bank"].includes(method)) {
    return { statusCode: 400, headers: cors(), body: JSON.stringify({ error: "Méthode invalide (mobile | bank)" }) };
  }
  if (method === "mobile" && !PROVIDER_MAP[provider]) {
    return { statusCode: 400, headers: cors(), body: JSON.stringify({ error: "Opérateur invalide (orange | wave | free)" }) };
  }
  if (!destination || destination.trim().length < 3) {
    return { statusCode: 400, headers: cors(), body: JSON.stringify({ error: "Destination (téléphone/IBAN) obligatoire" }) };
  }

  // ── Calcul du solde disponible depuis Supabase ────────────────────────────
  // 1. Total des commandes livrées pour ce vendeur
  const { data: orders, error: ordErr } = await sb
    .from("orders")
    .select("total, commission")
    .eq("vendor", user.id)
    .eq("status", "delivered");

  if (ordErr) {
    console.error("[payout-request] orders error:", ordErr.message);
    return { statusCode: 500, headers: cors(), body: JSON.stringify({ error: "Impossible de calculer le solde" }) };
  }

  const EUR_TO_XOF  = 655.957;
  const grossXof    = (orders || []).reduce((s, o) => s + Math.round((o.total || 0) * EUR_TO_XOF), 0);
  const commXof     = (orders || []).reduce((s, o) => {
    const c = o.commission != null ? o.commission : (o.total || 0) * NEXUS_COMMISSION;
    return s + Math.round(c * EUR_TO_XOF);
  }, 0);
  const netXof      = grossXof - commXof;

  // 2. Somme des retraits déjà approuvés/en cours pour ce vendeur
  const { data: existingPayouts, error: payErr } = await sb
    .from("payout_requests")
    .select("amount_xof, status")
    .eq("vendor_id", user.id)
    .in("status", ["pending", "processing", "paid"]);

  if (payErr) {
    console.error("[payout-request] payouts error:", payErr.message);
    return { statusCode: 500, headers: cors(), body: JSON.stringify({ error: "Impossible de vérifier les retraits existants" }) };
  }

  const usedXof     = (existingPayouts || []).reduce((s, p) => s + (p.amount_xof || 0), 0);
  const availableXof= Math.max(0, netXof - usedXof);

  if (amount > availableXof) {
    return {
      statusCode: 400,
      headers: cors(),
      body: JSON.stringify({
        error: `Solde insuffisant. Disponible : ${availableXof.toLocaleString("fr-FR")} FCFA`,
        available: availableXof,
      }),
    };
  }

  // ── Récupération du profil vendeur ────────────────────────────────────────
  const { data: profile } = await sb
    .from("users")
    .select("name, email")
    .eq("id", user.id)
    .single();

  const vendorName  = profile?.name  || user.email || "Vendeur";
  const vendorEmail = profile?.email || user.email;

  // ── Création de la demande en Supabase (statut initial : pending) ─────────
  const refCommand  = `NEXUS-PAY-${Date.now()}`;
  const { data: newPayout, error: insertErr } = await sb
    .from("payout_requests")
    .insert({
      vendor_id:    user.id,
      vendor_name:  vendorName,
      vendor_email: vendorEmail,
      amount_xof:   amount,
      method,
      provider:     method === "mobile" ? provider : "bank",
      destination:  destination.trim(),
      status:       "pending",
      ref_command:  refCommand,
    })
    .select()
    .single();

  if (insertErr) {
    console.error("[payout-request] insert error:", insertErr.message);
    return { statusCode: 500, headers: cors(), body: JSON.stringify({ error: "Impossible de créer la demande" }) };
  }

  // ── Appel PayTech pour initier le transfert ───────────────────────────────
  // PayTech Transfer : envoi d'argent vers un compte mobile money
  const paytechPayload = {
    item_name:    `Retrait vendeur NEXUS — ${vendorName}`,
    item_price:   amount,
    currency:     "XOF",
    ref_command:  refCommand,
    command_name: `Paiement ${method === "mobile" ? PROVIDER_MAP[provider] : "virement bancaire"}`,
    env:          PAYTECH_ENV,
    ipn_url:      `${SITE_URL}/.netlify/functions/paytech-payout-webhook`,
    success_url:  `${SITE_URL}/?payout=success`,
    cancel_url:   `${SITE_URL}/?payout=cancel`,
    custom_field: JSON.stringify({
      payout_id:  newPayout.id,
      vendor_id:  user.id,
      ref:        refCommand,
    }),
    // Paramètres spécifiques au transfert mobile money
    ...(method === "mobile" && {
      payment_method: `${provider}-money`,
      phone_number:   destination.replace(/\s/g, ""),
    }),
  };

  let paytechResult = null;
  let paytechError  = null;

  try {
    const ptRes = await paytechTransfer(paytechPayload);
    console.log("[payout-request] PayTech response:", JSON.stringify(ptRes.body));

    if (ptRes.status === 200 && ptRes.body?.success === 1) {
      // PayTech a accepté la demande → mise à jour statut "processing"
      paytechResult = ptRes.body;
      await sb
        .from("payout_requests")
        .update({
          status:        "processing",
          paytech_token: ptRes.body.token || null,
          paytech_ref:   ptRes.body.ref_command || refCommand,
        })
        .eq("id", newPayout.id);
    } else {
      paytechError = ptRes.body?.error || "Réponse PayTech inattendue";
      console.warn("[payout-request] PayTech non-success:", ptRes.body);
      // Demande reste en "pending" pour traitement manuel par l'admin
    }
  } catch (e) {
    paytechError = e.message;
    console.error("[payout-request] PayTech call failed:", e.message);
    // Demande reste en "pending"
  }

  // ── Notification admin ────────────────────────────────────────────────────
  await sb.from("notifications").insert({
    user_id:  "admin",
    type:     "payout",
    title:    "💰 Demande de retrait",
    message:  `${vendorName} demande ${amount.toLocaleString("fr-FR")} FCFA via ${method === "mobile" ? PROVIDER_MAP[provider] : "virement"}`,
    read:     false,
  }).catch(e => console.warn("[payout-request] notif error:", e.message));

  // ── Réponse au client ─────────────────────────────────────────────────────
  return {
    statusCode: 201,
    headers: { ...cors(), "Content-Type": "application/json" },
    body: JSON.stringify({
      ok:          true,
      payout_id:   newPayout.id,
      ref_command: refCommand,
      status:      paytechResult ? "processing" : "pending",
      amount_xof:  amount,
      available:   availableXof - amount,
      paytech_ok:  !!paytechResult,
      ...(paytechError && { paytech_warning: paytechError }),
    }),
  };
};
