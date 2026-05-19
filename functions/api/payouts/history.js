/**
 * GET /api/payout/history
 * Retourne le portefeuille vendeur (solde, en attente, déjà retiré) + historique des retraits.
 *
 * Calcul du solde :
 *   1. Somme des commandes livrées (status=delivered) du vendeur
 *   2. Moins la commission NEXUS (10%)
 *   3. Moins les payouts déjà versés (status=paid)
 *
 * Variables d'env : SUPABASE_URL, SUPABASE_SERVICE_KEY
 */
export async function onRequestGet(context) {
  const { request, env } = context;

  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_KEY) {
    return json({ error: 'Supabase non configuré' }, 503);
  }

  const auth = request.headers.get('Authorization');
  if (!auth || !auth.startsWith('Bearer ')) {
    return json({ error: 'Non authentifié' }, 401);
  }
  const token = auth.replace('Bearer ', '');

  // Identifier l'utilisateur via le JWT
  let userId;
  try {
    const userRes = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
      headers: {
        'apikey': env.SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${token}`
      }
    });
    if (!userRes.ok) return json({ error: 'Token invalide ou expiré' }, 401);
    const userData = await userRes.json();
    userId = userData.id;
  } catch (e) {
    return json({ error: 'Auth error', detail: e.message }, 401);
  }

  const COMMISSION_RATE = 0.10;
  const EUR_TO_XOF = 655.957;

  try {
    // 1. Commandes livrées du vendeur
    const ordersRes = await fetch(
      `${env.SUPABASE_URL}/rest/v1/orders?vendor_id=eq.${userId}&status=eq.delivered&select=id,total,amount_fcfa,order_total,created_at`,
      {
        headers: {
          'apikey': env.SUPABASE_SERVICE_KEY,
          'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}`
        }
      }
    );
    const orders = await ordersRes.json();
    const deliveredOrders = Array.isArray(orders) ? orders : [];

    // Calculer le total des ventes en XOF
    let totalSalesXof = 0;
    for (const o of deliveredOrders) {
      if (o.amount_fcfa) {
        totalSalesXof += Number(o.amount_fcfa);
      } else if (o.total) {
        totalSalesXof += Math.round(Number(o.total) * EUR_TO_XOF);
      } else if (o.order_total) {
        totalSalesXof += Math.round(Number(o.order_total) * EUR_TO_XOF);
      }
    }

    const commissionXof = Math.round(totalSalesXof * COMMISSION_RATE);
    const netXof = totalSalesXof - commissionXof;

    // 2. Historique des payout requests
    const payoutsRes = await fetch(
      `${env.SUPABASE_URL}/rest/v1/payout_requests?vendor_id=eq.${userId}&order=created_at.desc&select=*`,
      {
        headers: {
          'apikey': env.SUPABASE_SERVICE_KEY,
          'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}`
        }
      }
    );
    const payouts = await payoutsRes.json();
    const payoutList = Array.isArray(payouts) ? payouts : [];

    const paidXof = payoutList
      .filter(p => p.status === 'paid')
      .reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

    const pendingXof = payoutList
      .filter(p => p.status === 'pending' || p.status === 'processing')
      .reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

    const availableXof = netXof - paidXof - pendingXof;

    return json({
      wallet: {
        total_sales_xof: totalSalesXof,
        commission_xof: commissionXof,
        net_xof: netXof,
        paid_xof: paidXof,
        pending_xof: pendingXof,
        available_xof: Math.max(0, availableXof),
        orders_count: deliveredOrders.length
      },
      payouts: payoutList
    });

  } catch (e) {
    return json({ error: 'Erreur calcul portefeuille', detail: e.message }, 500);
  }
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}
