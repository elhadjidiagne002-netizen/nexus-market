/**
 * PATCH /api/orders/:id/status
 * Met à jour le statut d'une commande.
 *
 * Sécurité : déléguée aux policies RLS Supabase. Le JWT user est forward,
 * Supabase rejette si auth.uid() ne matche pas vendor_id/buyer_id/admin.
 *
 * Body : { status: "in_transit" | "delivered" | "cancelled" | "processing" }
 */
// [FIX] Le frontend envoie désormais POST (PATCH rejeté 405 par Cloudflare Pages).
// onRequestPatch est conservé en alias pour rétro-compatibilité si d'autres
// clients appellent encore PATCH directement.
async function handleUpdateStatus(context) {
  const { request, env, params } = context;
  const orderId = params.id;

  // Accepter SUPABASE_ANON_KEY (préféré) ou SUPABASE_SERVICE_KEY (fallback)
  const apiKey = env.SUPABASE_ANON_KEY || env.SUPABASE_SERVICE_KEY;
  if (!env.SUPABASE_URL || !apiKey) {
    return json({ error: 'Supabase non configuré (SUPABASE_URL + SUPABASE_ANON_KEY ou SERVICE_KEY requis)' }, 503);
  }

  const auth = request.headers.get('Authorization');
  if (!auth || !auth.startsWith('Bearer ')) {
    return json({ error: 'Non authentifié' }, 401);
  }
  const token = auth.replace('Bearer ', '');

  if (!orderId) return json({ error: 'orderId manquant' }, 400);

  let body;
  try { body = await request.json(); }
  catch { return json({ error: 'Body JSON invalide' }, 400); }

  const { status } = body;
  const VALID = ['processing', 'in_transit', 'delivered', 'cancelled'];
  if (!status || !VALID.includes(status)) {
    return json({ error: `Statut invalide. Valeurs : ${VALID.join(', ')}` }, 400);
  }

  // [SCHÉMA] Les colonnes *_at existent bien (vérifié sur le backup 2026-06-10 :
  // processing_at, in_transit_at, delivered_at, cancelled_at).
  const now = new Date().toISOString();
  const updates = { status, updated_at: now };
  const _stampCol = { processing: 'processing_at', in_transit: 'in_transit_at', delivered: 'delivered_at', cancelled: 'cancelled_at' }[status];
  if (_stampCol) updates[_stampCol] = now;

  // [FIX PAIEMENT] Filet de sécurité : une commande LIVRÉE est forcément payée
  // (paiement mobile money / carte encaissé, ou espèces remises à la livraison).
  // Évite que des commandes livrées restent payment_status='pending' lorsque le
  // webhook Stripe / IPN PayTech n'a pas marqué le paiement (mauvaise config, COD…).
  if (status === 'delivered') updates.payment_status = 'paid';

  try {
    const ctrl = new AbortController();
    const timeoutId = setTimeout(() => ctrl.abort(), 15000);

    const patchRes = await fetch(
      `${env.SUPABASE_URL}/rest/v1/orders?id=eq.${encodeURIComponent(orderId)}`,
      {
        method: 'PATCH',
        headers: {
          'apikey': apiKey,
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation'
        },
        body: JSON.stringify(updates),
        signal: ctrl.signal
      }
    );
    clearTimeout(timeoutId);

    if (!patchRes.ok) {
      const errText = await patchRes.text().catch(() => '');
      if (patchRes.status === 401) return json({ error: 'Token expiré' }, 401);
      if (patchRes.status === 403) return json({ error: 'Non autorisé (RLS)' }, 403);
      if (patchRes.status === 404) return json({ error: 'Commande introuvable' }, 404);
      return json({ error: 'Erreur Supabase', detail: errText.substring(0, 200) }, 502);
    }

    const updated = await patchRes.json().catch(() => []);
    if (!Array.isArray(updated) || updated.length === 0) {
      return json({ error: 'Commande introuvable ou non autorisée' }, 404);
    }

    return json({ ok: true, order_id: orderId, status, updated: updated[0] });

  } catch (e) {
    if (e.name === 'AbortError') return json({ error: 'Timeout Supabase (>15s)' }, 504);
    return json({ error: 'Erreur serveur', detail: e.message }, 500);
  }
}

// Exports Cloudflare Pages Functions
export const onRequestPost  = handleUpdateStatus; // méthode principale (frontend v2+)
export const onRequestPatch = handleUpdateStatus; // alias rétro-compatible

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}
