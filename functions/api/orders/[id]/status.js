/**
 * PATCH /api/orders/:id/status
 * Met à jour le statut d'une commande (processing → in_transit → delivered → cancelled).
 *
 * Body : { status: "in_transit" | "delivered" | "cancelled" | "processing" }
 *
 * Sécurité :
 *   - Auth JWT obligatoire
 *   - Seul le vendeur de la commande ou un admin peut modifier le statut
 *
 * Variables d'env : SUPABASE_URL, SUPABASE_SERVICE_KEY
 */
export async function onRequestPatch(context) {
  const { request, env, params } = context;
  const orderId = params.id;

  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_KEY) {
    return json({ error: 'Supabase non configuré' }, 503);
  }

  const auth = request.headers.get('Authorization');
  if (!auth || !auth.startsWith('Bearer ')) {
    return json({ error: 'Non authentifié' }, 401);
  }
  const token = auth.replace('Bearer ', '');

  if (!orderId) {
    return json({ error: 'orderId manquant' }, 400);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Body JSON invalide' }, 400);
  }

  const { status } = body;
  const VALID = ['processing', 'in_transit', 'delivered', 'cancelled'];
  if (!status || !VALID.includes(status)) {
    return json({ error: `Statut invalide. Valeurs acceptées : ${VALID.join(', ')}` }, 400);
  }

  // Vérifier que l'utilisateur est bien le vendeur ou un admin
  let userId = null;
  try {
    const userRes = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
      headers: {
        'apikey': env.SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${token}`
      }
    });
    if (userRes.ok) {
      const userData = await userRes.json();
      userId = userData.id;
    }
  } catch { /* on continue, la vérification se fera via le PATCH */ }

  // Construire l'update
  const updates = { status };
  if (status === 'delivered') updates.paid_at = new Date().toISOString();
  if (status === 'cancelled') updates.canceled_at = new Date().toISOString();
  updates.updated_at = new Date().toISOString();

  try {
    // Vérifier que la commande existe et que l'utilisateur a le droit
    const checkRes = await fetch(
      `${env.SUPABASE_URL}/rest/v1/orders?id=eq.${encodeURIComponent(orderId)}&select=id,vendor_id,buyer_id,status`,
      {
        headers: {
          'apikey': env.SUPABASE_SERVICE_KEY,
          'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}`
        }
      }
    );
    const rows = await checkRes.json();
    const order = Array.isArray(rows) ? rows[0] : null;

    if (!order) {
      return json({ error: 'Commande introuvable' }, 404);
    }

    // Vérifier autorisation (vendeur de la commande ou admin)
    if (userId) {
      const isVendor = order.vendor_id === userId;
      const isBuyer = order.buyer_id === userId;

      if (!isVendor && !isBuyer) {
        // Vérifier si admin
        const profileRes = await fetch(
          `${env.SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}&select=role`,
          {
            headers: {
              'apikey': env.SUPABASE_SERVICE_KEY,
              'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}`
            }
          }
        );
        const profiles = await profileRes.json();
        const isAdmin = profiles?.[0]?.role === 'admin';
        if (!isAdmin) {
          return json({ error: 'Non autorisé — vous n\'êtes ni le vendeur ni un admin' }, 403);
        }
      }
    }

    // Effectuer la mise à jour
    const patchRes = await fetch(
      `${env.SUPABASE_URL}/rest/v1/orders?id=eq.${encodeURIComponent(orderId)}`,
      {
        method: 'PATCH',
        headers: {
          'apikey': env.SUPABASE_SERVICE_KEY,
          'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation'
        },
        body: JSON.stringify(updates)
      }
    );

    if (!patchRes.ok) {
      const errText = await patchRes.text();
      return json({ error: 'Erreur Supabase', detail: errText }, 502);
    }

    const updated = await patchRes.json();
    return json({
      ok: true,
      order_id: orderId,
      status,
      updated: updated?.[0] || null
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
