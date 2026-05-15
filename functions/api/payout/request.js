// ── POST /api/payout/request ───────────────────────────────────────────────
// Crée une demande de virement pour le vendeur authentifié.
// Vérifie que le solde disponible est suffisant avant d'enregistrer.
// Cloudflare Pages Function.
//
// Corps attendu (JSON) :
//   { amount (FCFA), method, provider, destination, vendorName? }
//
// Réponse 200 : { id, status: "pending", amount, … }

export async function onRequestPost(context) {
  const { request, env } = context;

  const SB_URL  = env.SUPABASE_URL;
  const SB_KEY  = env.SUPABASE_SERVICE_KEY;

  if (!SB_URL || !SB_KEY) return jsonResponse({ error: "Supabase non configuré" }, 500);

  // ── Authentification ──────────────────────────────────────────────────────
  const jwt = (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!jwt) return jsonResponse({ error: "Non authentifié" }, 401);

  const userRes = await fetch(`${SB_URL}/auth/v1/user`, {
    headers: { "apikey": SB_KEY, "Authorization": `Bearer ${jwt}` },
  }).catch(() => null);
  if (!userRes?.ok) return jsonResponse({ error: "Token invalide" }, 401);

  const { id: vendorId, email } = await userRes.json();
  if (!vendorId) return jsonResponse({ error: "Utilisateur introuvable" }, 401);

  // ── Corps ─────────────────────────────────────────────────────────────────
  let body;
  try { body = await request.json(); }
  catch { return jsonResponse({ error: "Corps JSON invalide" }, 400); }

  const { amount, method = "mobile", provider, destination, vendorName } = body || {};

  if (!amount || typeof amount !== "number" || amount < 500) {
    return jsonResponse({ error: "Montant invalide (minimum 500 FCFA)" }, 400);
  }
  if (!destination) {
    return jsonResponse({ error: "Destination (numéro / IBAN) requise" }, 400);
  }

  // ── Vérifier le solde disponible ──────────────────────────────────────────
  const cbRes = await fetch(
    `${SB_URL}/rest/v1/cashback_transactions?user_id=eq.${vendorId}&select=amount_xof,type`,
    { headers: { "apikey": SB_KEY, "Authorization": `Bearer ${SB_KEY}` } }
  ).catch(() => null);

  const cashbacks = cbRes?.ok ? await cbRes.json() : [];
  const cashbackBalance = cashbacks.reduce((sum, t) =>
    (t.type === "earn" || t.type === "bonus") ? sum + (t.amount_xof || 0) : sum - (t.amount_xof || 0)
  , 0);

  const payoutsRes = await fetch(
    `${SB_URL}/rest/v1/payout_requests?vendor_id=eq.${vendorId}&status=in.(pending,approved,processing)&select=amount`,
    { headers: { "apikey": SB_KEY, "Authorization": `Bearer ${SB_KEY}` } }
  ).catch(() => null);

  const inFlight = payoutsRes?.ok ? await payoutsRes.json() : [];
  const reservedXof = inFlight.reduce((s, p) => s + (p.amount || 0), 0);
  const paidRes = await fetch(
    `${SB_URL}/rest/v1/payout_requests?vendor_id=eq.${vendorId}&status=eq.paid&select=amount`,
    { headers: { "apikey": SB_KEY, "Authorization": `Bearer ${SB_KEY}` } }
  ).catch(() => null);
  const paidRows = paidRes?.ok ? await paidRes.json() : [];
  const paidXof = paidRows.reduce((s, p) => s + (p.amount || 0), 0);

  const available = Math.max(0, cashbackBalance - reservedXof - paidXof);

  if (amount > available) {
    return jsonResponse({
      error: `Solde insuffisant. Disponible : ${Math.round(available).toLocaleString("fr-FR")} FCFA`,
    }, 422);
  }

  // ── Insérer la demande ────────────────────────────────────────────────────
  const row = {
    vendor_id:   vendorId,
    vendor_name: vendorName || email || "Vendeur",
    amount,
    method,
    provider:    provider || method,
    destination,
    status:      "pending",
    created_at:  new Date().toISOString(),
    updated_at:  new Date().toISOString(),
  };

  const insRes = await fetch(`${SB_URL}/rest/v1/payout_requests`, {
    method:  "POST",
    headers: {
      "Content-Type":  "application/json",
      "apikey":        SB_KEY,
      "Authorization": `Bearer ${SB_KEY}`,
      "Prefer":        "return=representation",
    },
    body: JSON.stringify(row),
  }).catch(() => null);

  if (!insRes?.ok) {
    const err = await insRes?.text().catch(() => "");
    return jsonResponse({ error: `Erreur Supabase : ${err}` }, 502);
  }

  const [created] = await insRes.json();
  return jsonResponse(created, 201);
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
  });
}
