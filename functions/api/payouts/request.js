/**
 * POST /api/payout/request
 * Crée une demande de retrait vendeur.
 *
 * Body : { amount: number (XOF), method: "wave"|"om"|"bank", details: string }
 *
 * Variables d'env : SUPABASE_URL, SUPABASE_SERVICE_KEY
 */
export async function onRequestPost(context) {
  const { request, env } = context;

  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_KEY) {
    return json({ error: 'Supabase non configuré' }, 503);
  }

  const auth = request.headers.get('Authorization');
  if (!auth || !auth.startsWith('Bearer ')) {
    return json({ error: 'Non authentifié' }, 401);
  }
  const token = auth.replace('Bearer ', '');

  let userId;
  try {
    const userRes = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
      headers: {
        'apikey': env.SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${token}`
      }
    });
    if (!userRes.ok) return json({ error: 'Token invalide' }, 401);
    const userData = await userRes.json();
    userId = userData.id;
  } catch (e) {
    return json({ error: 'Auth error' }, 401);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Body JSON invalide' }, 400);
  }

  const { amount, method, details } = body;

  if (!amount || isNaN(amount) || Number(amount) <= 0) {
    return json({ error: 'Montant invalide (doit être > 0)' }, 400);
  }
  if (!method) {
    return json({ error: 'Méthode de paiement requise (wave, om, bank)' }, 400);
  }

  const amountNum = Math.round(Number(amount));

  // Vérifier le solde disponible (même calcul que GET /api/payout/history)
  const COMMISSION_RATE = 0.10;
  const EUR_TO_XOF = 655.957;

  try {
    // Total ventes livrées
    const ordersRes = await fetch(
      `${env.SUPABASE_URL}/rest/v1/orders?vendor_id=eq.${userId}&status=eq.delivered&select=total,amount_fcfa,order_total`,
      { headers: { 'apikey': env.SUPABASE_SERVICE_KEY, 'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}` } }
    );
    const orders = await ordersRes.json();
    let totalSalesXof = 0;
    for (const o of (Array.isArray(orders) ? orders : [])) {
      if (o.amount_fcfa) totalSalesXof += Number(o.amount_fcfa);
      else if (o.total) totalSalesXof += Math.round(Number(o.total) * EUR_TO_XOF);
      else if (o.order_total) totalSalesXof += Math.round(Number(o.order_total) * EUR_TO_XOF);
    }
    const netXof = totalSalesXof - Math.round(totalSalesXof * COMMISSION_RATE);

    // Total déjà retiré + en attente
    const payoutsRes = await fetch(
      `${env.SUPABASE_URL}/rest/v1/payout_requests?vendor_id=eq.${userId}&select=amount,status`,
      { headers: { 'apikey': env.SUPABASE_SERVICE_KEY, 'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}` } }
    );
    const payouts = await payoutsRes.json();
    const usedXof = (Array.isArray(payouts) ? payouts : [])
      .filter(p => p.status !== 'failed' && p.status !== 'cancelled')
      .reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

    const availableXof = netXof - usedXof;

    if (amountNum > availableXof) {
      return json({
        error: `Solde insuffisant. Disponible : ${Math.max(0, availableXof).toLocaleString('fr-FR')} FCFA, demandé : ${amountNum.toLocaleString('fr-FR')} FCFA`
      }, 400);
    }

    // Créer la demande
    const row = {
      vendor_id: userId,
      amount: amountNum,
      method,
      details: details || '',
      status: 'pending',
      created_at: new Date().toISOString()
    };

    const insertRes = await fetch(
      `${env.SUPABASE_URL}/rest/v1/payout_requests`,
      {
        method: 'POST',
        headers: {
          'apikey': env.SUPABASE_SERVICE_KEY,
          'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation'
        },
        body: JSON.stringify(row)
      }
    );

    if (!insertRes.ok) {
      const errText = await insertRes.text();
      return json({ error: 'Erreur création demande', detail: errText }, 502);
    }

    const created = await insertRes.json();

    return json({
      ok: true,
      payout: created?.[0] || row,
      available_after: Math.max(0, availableXof - amountNum)
    });

  } catch (e) {
    return json({ error: 'Erreur serveur', detail: e.message }, 500);
  }
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}
