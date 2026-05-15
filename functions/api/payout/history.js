// ── GET /api/payout/history ────────────────────────────────────────────────
// Retourne le solde portefeuille + l'historique des demandes de virement
// pour le vendeur authentifié.
// Cloudflare Pages Function — appelée par VendorWalletCard et PayoutHistoryView.
//
// Réponse 200 :
// {
//   wallet: { available_xof, pending_xof, paid_xof, total_xof },
//   payouts: [{ id, amount, method, provider, status, created_at, … }]
// }

export async function onRequestGet(context) {
  const { request, env } = context;

  const SB_URL  = env.SUPABASE_URL;
  const SB_KEY  = env.SUPABASE_SERVICE_KEY;

  if (!SB_URL || !SB_KEY) {
    return jsonResponse({ error: "Supabase non configuré" }, 500);
  }

  // ── Extraire le JWT vendeur depuis le header Authorization ────────────────
  const authHeader = request.headers.get("Authorization") || "";
  const jwt = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!jwt) return jsonResponse({ error: "Non authentifié" }, 401);

  // ── Résoudre l'user_id depuis le JWT via Supabase auth ───────────────────
  const userRes = await fetch(`${SB_URL}/auth/v1/user`, {
    headers: { "apikey": SB_KEY, "Authorization": `Bearer ${jwt}` },
  }).catch(() => null);

  if (!userRes || !userRes.ok) return jsonResponse({ error: "Token invalide" }, 401);
  const { id: vendorId } = await userRes.json();
  if (!vendorId) return jsonResponse({ error: "Utilisateur introuvable" }, 401);

  // ── Récupérer les demandes de virement ────────────────────────────────────
  const payoutsRes = await fetch(
    `${SB_URL}/rest/v1/payout_requests?vendor_id=eq.${vendorId}&order=created_at.desc&limit=50`,
    { headers: { "apikey": SB_KEY, "Authorization": `Bearer ${SB_KEY}` } }
  ).catch(() => null);

  const payouts = payoutsRes?.ok ? await payoutsRes.json() : [];

  // ── Calculer le cashback disponible (commissions ambassadeur + achats) ────
  const cashbackRes = await fetch(
    `${SB_URL}/rest/v1/cashback_transactions?user_id=eq.${vendorId}&select=amount_xof,type`,
    { headers: { "apikey": SB_KEY, "Authorization": `Bearer ${SB_KEY}` } }
  ).catch(() => null);

  const cashbacks = cashbackRes?.ok ? await cashbackRes.json() : [];
  const cashbackBalance = cashbacks.reduce((sum, t) =>
    (t.type === "earn" || t.type === "bonus") ? sum + (t.amount_xof || 0) : sum - (t.amount_xof || 0)
  , 0);

  // ── Calculer les totaux virements ─────────────────────────────────────────
  const pending_xof = payouts
    .filter(p => ["pending", "approved", "processing"].includes(p.status))
    .reduce((s, p) => s + (p.amount || 0), 0);

  const paid_xof = payouts
    .filter(p => p.status === "paid")
    .reduce((s, p) => s + (p.amount || 0), 0);

  // Solde disponible = cashback - déjà versé - en cours
  const available_xof = Math.max(0, cashbackBalance - paid_xof - pending_xof);

  return jsonResponse({
    wallet: {
      available_xof: Math.round(available_xof),
      pending_xof:   Math.round(pending_xof),
      paid_xof:      Math.round(paid_xof),
      total_xof:     Math.round(cashbackBalance),
    },
    payouts: payouts.map(p => ({
      id:          p.id,
      amount:      p.amount,
      method:      p.method,
      provider:    p.provider,
      destination: p.destination,
      status:      p.status,
      admin_note:  p.admin_note,
      created_at:  p.created_at,
      processed_at:p.processed_at,
    })),
  });
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
  });
}
