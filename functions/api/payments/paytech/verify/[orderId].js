/**
 * GET /api/payments/paytech/verify/:orderId
 * Vérifie le statut d'un paiement PayTech (sécurisé côté serveur, sans exposer les clés).
 *
 * Le paramètre dynamique [orderId] vient du nom de fichier [orderId].js (convention Pages Functions).
 *
 * Variables d'environnement :
 *   PAYTECH_API_KEY, PAYTECH_API_SECRET, SUPABASE_URL, SUPABASE_SERVICE_KEY
 */
export async function onRequestGet(context) {
  const { request, env, params } = context;
  const orderId = params.orderId;

  if (!env.PAYTECH_API_KEY || !env.PAYTECH_API_SECRET) {
    return json({ error: 'PayTech non configuré' }, 503);
  }

  const auth = request.headers.get('Authorization');
  if (!auth || !auth.startsWith('Bearer ')) {
    return json({ error: 'Non authentifié' }, 401);
  }

  if (!orderId) {
    return json({ error: 'orderId manquant' }, 400);
  }

  // ── Récupération du statut depuis Supabase ───────────────────────────────
  // L'IPN PayTech doit mettre à jour la table `orders` avec payment_status.
  // On lit depuis Supabase plutôt que d'interroger PayTech (qui n'a pas
  // forcément d'endpoint "get-status" public et stable).
  if (env.SUPABASE_URL && env.SUPABASE_SERVICE_KEY) {
    try {
      const sbRes = await fetch(
        `${env.SUPABASE_URL}/rest/v1/orders?id=eq.${encodeURIComponent(orderId)}&select=id,payment_status,payment_ref,total,currency`,
        {
          headers: {
            'apikey': env.SUPABASE_SERVICE_KEY,
            'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}`
          }
        }
      );
      const rows = await sbRes.json();
      const order = Array.isArray(rows) ? rows[0] : null;

      if (!order) {
        return json({ error: 'Commande introuvable' }, 404);
      }

      return json({
        order_id: order.id,
        status: order.payment_status || 'pending',
        payment_ref: order.payment_ref || null,
        amount: order.total,
        currency: order.currency
      });
    } catch (e) {
      return json({ error: 'Erreur Supabase', detail: e.message }, 502);
    }
  }

  return json({ error: 'Supabase non configuré côté serveur' }, 503);
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}
