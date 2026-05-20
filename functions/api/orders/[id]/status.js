/**
 * POST /api/orders/:id/status  (PATCH accepté aussi en alias)
 * Met à jour le statut d'une commande.
 *
 * Sécurité en deux étapes :
 *   1. Validation du JWT via /auth/v1/user → 401 si expiré/invalide
 *   2. UPDATE via le service key (bypass RLS) avec vérification manuelle
 *      que l'appelant est bien le vendor, le buyer ou un admin.
 *
 * Ce découplage évite le faux 404 causé par un token expiré qui faisait
 * apparaître l'utilisateur comme anonyme → RLS bloquait → tableau vide [].
 *
 * Body : { status: "in_transit" | "delivered" | "cancelled" | "processing" }
 */
async function handleUpdateStatus(context) {
  const { request, env, params } = context;
  const orderId = params.id;

  // ── 1. Variables d'environnement ────────────────────────────────────────
  const serviceKey = env.SUPABASE_SERVICE_KEY;
  const anonKey    = env.SUPABASE_ANON_KEY || serviceKey;
  if (!env.SUPABASE_URL || !serviceKey) {
    return json({
      error: 'Supabase non configuré — SUPABASE_URL + SUPABASE_SERVICE_KEY requis'
    }, 503);
  }

  // ── 2. Récupération du token utilisateur ────────────────────────────────
  const authHeader = request.headers.get('Authorization') || '';
  if (!authHeader.startsWith('Bearer ')) {
    return json({ error: 'Non authentifié — header Authorization manquant' }, 401);
  }
  const userToken = authHeader.replace('Bearer ', '').trim();
  if (!orderId) return json({ error: 'orderId manquant' }, 400);

  // ── 3. Validation du body ────────────────────────────────────────────────
  let body;
  try { body = await request.json(); }
  catch { return json({ error: 'Body JSON invalide' }, 400); }

  const { status } = body;
  const VALID = ['processing', 'in_transit', 'delivered', 'cancelled'];
  if (!status || !VALID.includes(status)) {
    return json({ error: `Statut invalide. Valeurs acceptées : ${VALID.join(', ')}` }, 400);
  }

  // ── 4. Validation du JWT : évite le faux 404 causé par un token expiré ──
  // PostgREST traite un JWT expiré comme un utilisateur anonyme : RLS bloque
  // silencieusement → tableau vide [] → notre ancien code renvoyait 404 à tort.
  // On vérifie d'abord que le token est valide avant de toucher la DB.
  let callerId;
  let callerRole;
  try {
    const authCheck = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
      headers: {
        'apikey': anonKey,
        'Authorization': `Bearer ${userToken}`,
      },
      signal: AbortSignal.timeout(8000),
    });

    if (authCheck.status === 401 || authCheck.status === 403) {
      return json({
        error: 'Session expirée — veuillez vous reconnecter',
        code: 'TOKEN_EXPIRED'
      }, 401);
    }
    if (!authCheck.ok) {
      const t = await authCheck.text().catch(() => '');
      return json({ error: 'Impossible de valider la session', detail: t.substring(0, 200) }, 502);
    }

    const authUser = await authCheck.json();
    callerId   = authUser.id;
    callerRole = authUser.app_metadata?.role || authUser.user_metadata?.role || null;
  } catch (e) {
    if (e.name === 'TimeoutError' || e.name === 'AbortError') {
      return json({ error: 'Timeout validation session (>8s)' }, 504);
    }
    return json({ error: 'Erreur validation session', detail: e.message }, 500);
  }

  // ── 5. Vérification des droits sur la commande (via service key) ─────────
  // On utilise le service key pour lire la commande sans que RLS interfère.
  // L'autorisation est ensuite vérifiée manuellement ci-dessous.
  let order;
  try {
    const orderRes = await fetch(
      `${env.SUPABASE_URL}/rest/v1/orders?id=eq.${encodeURIComponent(orderId)}&select=id,status,vendor_id,buyer_id`,
      {
        headers: {
          'apikey': serviceKey,
          'Authorization': `Bearer ${serviceKey}`,
        },
        signal: AbortSignal.timeout(8000),
      }
    );
    if (!orderRes.ok) {
      return json({ error: 'Erreur lecture commande' }, 502);
    }
    const rows = await orderRes.json().catch(() => []);
    if (!Array.isArray(rows) || rows.length === 0) {
      return json({ error: 'Commande introuvable' }, 404);
    }
    order = rows[0];
  } catch (e) {
    if (e.name === 'TimeoutError' || e.name === 'AbortError') {
      return json({ error: 'Timeout lecture commande (>8s)' }, 504);
    }
    return json({ error: 'Erreur serveur', detail: e.message }, 500);
  }

  // Vérification des droits : vendor, buyer, ou admin
  const isAdmin  = callerRole === 'admin';
  const isVendor = order.vendor_id === callerId;
  const isBuyer  = order.buyer_id  === callerId;
  if (!isAdmin && !isVendor && !isBuyer) {
    return json({ error: 'Non autorisé — vous n\'êtes ni vendeur, ni acheteur, ni admin de cette commande' }, 403);
  }

  // ── 6. Mise à jour du statut ─────────────────────────────────────────────
  // [FIX] Seuls status et updated_at existent dans le schéma orders.
  // Les colonnes *_at (delivered_at, cancelled_at, etc.) n'existent pas
  // → Supabase rejetait avec 400 "column not found in schema cache".
  const updates = { status, updated_at: new Date().toISOString() };

  try {
    const ctrl = new AbortController();
    const timeoutId = setTimeout(() => ctrl.abort(), 15000);

    const patchRes = await fetch(
      `${env.SUPABASE_URL}/rest/v1/orders?id=eq.${encodeURIComponent(orderId)}`,
      {
        method: 'PATCH',
        headers: {
          'apikey':        serviceKey,
          'Authorization': `Bearer ${serviceKey}`,
          'Content-Type':  'application/json',
          'Prefer':        'return=representation',
        },
        body: JSON.stringify(updates),
        signal: ctrl.signal,
      }
    );
    clearTimeout(timeoutId);

    if (!patchRes.ok) {
      const errText = await patchRes.text().catch(() => '');
      return json({ error: 'Erreur Supabase lors de la mise à jour', detail: errText.substring(0, 200) }, 502);
    }

    const updated = await patchRes.json().catch(() => []);
    // Avec le service key, un tableau vide signifie réellement "introuvable"
    // (le cas "RLS bloque silencieusement" est éliminé par la vérif manuelle ci-dessus).
    if (!Array.isArray(updated) || updated.length === 0) {
      return json({ error: 'Commande introuvable (supprimée entre-temps ?)' }, 404);
    }

    return json({ ok: true, order_id: orderId, status, updated: updated[0] });

  } catch (e) {
    if (e.name === 'AbortError') return json({ error: 'Timeout Supabase mise à jour (>15s)' }, 504);
    return json({ error: 'Erreur serveur', detail: e.message }, 500);
  }
}

// ── Exports Cloudflare Pages Functions ──────────────────────────────────────
export const onRequestPost  = handleUpdateStatus; // méthode principale (frontend v2+)
export const onRequestPatch = handleUpdateStatus; // alias rétro-compatible

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
