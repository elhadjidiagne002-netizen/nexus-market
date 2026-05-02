/**
 * ══════════════════════════════════════════════════════════════════════════════
 * NEXUS Market — SupabaseStorage v1.0.0
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * REMPLACEMENT DROP-IN de l'objet `storage` (localStorage) dans index.html.
 * Toutes les méthodes deviennent ASYNC et écrivent en priorité dans Supabase
 * via l'API backend (JWT requis). localStorage reste utilisé comme :
 *   1. Cache de lecture immédiate (zéro latence au chargement)
 *   2. Fallback hors-ligne (si l'API est injoignable)
 *   3. Données éphémères/UI (cookie_consent, recently_viewed, etc.)
 *
 * INSTALLATION (dans index.html) :
 *   1. Charger ce script APRÈS l'initialisation de Supabase et AVANT l'app.
 *   2. Remplacer `const storage = { ... }` par ce module.
 *   3. Partout où `storage.set(...)` est appelé de manière synchrone,
 *      utiliser `.catch(()=>{})` pour absorber les erreurs async silencieusement.
 *      Exemple : `SupabaseStorage.set('products', data).catch(()=>{})` ou
 *                attendre `await SupabaseStorage.set('products', data)`.
 *
 * STRATÉGIE PAR CLÉ :
 *   ┌────────────────────┬──────────────────────────────────────────────────┐
 *   │ Clé localStorage   │ Table Supabase / comportement                    │
 *   ├────────────────────┼──────────────────────────────────────────────────┤
 *   │ products           │ API GET /api/products  (lecture seule côté front) │
 *   │ orders             │ API GET /api/orders                               │
 *   │ messages           │ API GET /api/messages                             │
 *   │ disputes           │ API GET /api/disputes                             │
 *   │ offers             │ API GET /api/offers                               │
 *   │ reviews            │ API GET /api/reviews                              │
 *   │ return_requests    │ API GET /api/returns                              │
 *   │ payout_requests    │ API GET /api/payouts (admin/vendor)               │
 *   │ nexus_coupons      │ API GET /api/coupons                              │
 *   │ flash_sales        │ API GET /api/flash-sales                          │
 *   │ wishlists          │ API wishlists → Supabase                          │
 *   │ stock_alerts       │ API stock-alerts → Supabase                       │
 *   │ loyalty_points     │ API loyalty-points → Supabase                     │
 *   │ notifications      │ Supabase direct (realtime)                        │
 *   │ product_qa         │ API product_questions → Supabase                  │
 *   │ referrals          │ API referrals → Supabase                          │
 *   │ cart_<userId>      │ API /api/cart → Supabase                          │
 *   │ recently_viewed    │ Supabase (recently_viewed)                        │
 *   │ pendingVendors     │ API /api/vendors/pending (admin)                  │
 *   │ cookie_consent     │ localStorage UNIQUEMENT (données UI)              │
 *   │ nexus_setup_done   │ localStorage UNIQUEMENT (flags UI)                │
 *   │ onboarding_done    │ localStorage UNIQUEMENT                           │
 *   │ data_v6            │ localStorage UNIQUEMENT (flags migration)         │
 *   │ nexus_saved_config │ localStorage UNIQUEMENT (config locale)           │
 *   │ nexus_user_role    │ localStorage UNIQUEMENT (cache rôle)              │
 *   │ guest_cart         │ localStorage UNIQUEMENT (panier non-connecté)     │
 *   │ nexus_jwt*         │ sessionStorage/localStorage UNIQUEMENT (tokens)   │
 *   └────────────────────┴──────────────────────────────────────────────────┘
 * ══════════════════════════════════════════════════════════════════════════════
 */

const SupabaseStorage = (() => {

  // ── Configuration ─────────────────────────────────────────────────────────
  // Ces valeurs sont lues depuis NEXUS_CONFIG qui est déjà défini dans index.html.
  // Le module s'auto-configure au premier appel via _init().

  let _apiUrl = null;
  let _sb     = null;   // Client Supabase JS
  let _userId = null;   // ID de l'utilisateur connecté (null si guest)

  function _init() {
    if (_apiUrl) return; // déjà initialisé
    _apiUrl = (typeof NEXUS_CONFIG !== 'undefined' && NEXUS_CONFIG.apiUrl) || '';
    _sb     = window._supabase || window.supabase_client || null;
  }

  /** Mettre à jour l'utilisateur courant (à appeler après login/logout) */
  function setUser(user) {
    _userId = user?.id || null;
  }

  // ── Clés purement localStorage (ne jamais pousser vers Supabase) ──────────
  const LS_ONLY_KEYS = new Set([
    'cookie_consent', 'nexus_setup_done', 'onboarding_done', 'data_v6', 'data_v5',
    'nexus_saved_config', 'nexus_user_role', 'guest_cart',
    'nexus_jwt', 'nexus_jwt_exp', 'nexus_refresh_token', 'nexus_refresh_exp',
    'nexus_migration_done_v1',
  ]);

  function isLsOnly(key) {
    return LS_ONLY_KEYS.has(key) ||
      key.startsWith('nexus_jwt') ||
      key.startsWith('nexus_migration_done_v1_') ||
      key.startsWith('nexus_refresh');
  }

  // ── Helpers localStorage ──────────────────────────────────────────────────
  function _lsGet(key) {
    try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : null; }
    catch { return null; }
  }

  function _lsSet(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; }
    catch { return false; }
  }

  function _lsDelete(key) {
    try { localStorage.removeItem(key); return true; }
    catch { return false; }
  }

  // ── Helper fetch API avec JWT ──────────────────────────────────────────────
  function _getJwt() {
    return sessionStorage.getItem('nexus_jwt') || localStorage.getItem('nexus_jwt') || null;
  }

  async function _apiFetch(path, options = {}) {
    _init();
    const jwt = _getJwt();
    const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
    if (jwt) headers['Authorization'] = `Bearer ${jwt}`;
    const res = await fetch(`${_apiUrl}${path}`, { ...options, headers });
    if (!res.ok) throw new Error(`API ${path} → ${res.status}`);
    return res.json().catch(() => ({}));
  }

  // ══════════════════════════════════════════════════════════════════════════
  // MAPPAGE CLÉ → ACTION DE PERSISTANCE SUPABASE
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Persiste la valeur dans Supabase selon la clé.
   * Retourne true si persisté, false si fallback localStorage.
   */
  async function _persistToSupabase(key, value) {
    _init();
    if (!_sb && !_apiUrl) return false;

    try {
      // ── Panier utilisateur ────────────────────────────────────────────────
      if (key.startsWith('cart_')) {
        const items = Array.isArray(value) ? value : [];
        // server.js expose PUT /api/cart (pas POST) pour le remplacement du panier
        await _apiFetch('/api/cart', { method: 'PUT', body: JSON.stringify({ items }) });
        return true;
      }

      // ── Wishlists ─────────────────────────────────────────────────────────
      if (key === 'wishlists' && _userId) {
        // value = { [userId]: [productId, ...], ... } ou tableau d'IDs
        const ids = Array.isArray(value) ? value : (value[_userId] || []);
        // Sync différentielle : compare avec ce qui est en Supabase
        if (_sb) {
          await _sb.from('wishlists').delete().eq('user_id', _userId).not('product_id', 'is', null);
          if (ids.length > 0) {
            const rows = ids.map(id => ({ user_id: _userId, product_id: id }));
            await _sb.from('wishlists').upsert(rows, { onConflict: 'user_id,product_id', ignoreDuplicates: true });
          }
          return true;
        }
      }

      // ── Alertes stock ─────────────────────────────────────────────────────
      if (key === 'stock_alerts' && _sb && _userId) {
        const items = Array.isArray(value) ? value : Object.values(value || {});
        const myAlerts = items.filter(a => a.userId === _userId || a.user_id === _userId);
        if (myAlerts.length > 0) {
          const rows = myAlerts.map(a => ({
            user_id:    _userId,
            product_id: a.productId || a.product_id,
          }));
          await _sb.from('stock_alerts')
            .upsert(rows, { onConflict: 'user_id,product_id', ignoreDuplicates: true });
        }
        return true;
      }

      // ── Points fidélité ───────────────────────────────────────────────────
      if (key === 'loyalty_points' && _sb && _userId) {
        const pts = typeof value === 'object' ? (value[_userId] || 0) : (value || 0);
        await _sb.from('loyalty_points')
          .upsert({ user_id: _userId, points: Number(pts), updated_at: new Date().toISOString() },
                  { onConflict: 'user_id' });
        return true;
      }

      // ── Notifications ─────────────────────────────────────────────────────
      if (key === 'notifications' && _sb && _userId) {
        const all = typeof value === 'object' && !Array.isArray(value) ? value : {};
        const myNotifs = Array.isArray(all[_userId]) ? all[_userId] : Object.values(all[_userId] || {});
        if (myNotifs.length > 0) {
          const rows = myNotifs.map(n => ({
            user_id:    _userId,
            type:       n.type    || 'info',
            title:      n.title   || n.message || 'Notification',
            message:    n.message || null,
            link:       n.link    || null,
            read:       !!n.read,
            created_at: n.createdAt || n.created_at || new Date().toISOString(),
          }));
          await _sb.from('notifications').upsert(rows);
        }
        return true;
      }

      // ── Questions produits ────────────────────────────────────────────────
      if (key === 'product_qa' && _sb) {
        const qa = value || {};
        const rows = [];
        for (const [productId, questions] of Object.entries(qa)) {
          if (!Array.isArray(questions)) continue;
          for (const q of questions) {
            if (!q.question) continue;
            rows.push({
              product_id:  productId,
              user_id:     q.userId || q.user_id || _userId,
              user_name:   q.userName || q.user_name || null,
              question:    q.question,
              answer:      q.answer || null,
              answered_at: q.answeredAt || q.answered_at || null,
              visible:     q.visible !== false,
              created_at:  q.createdAt || q.created_at || new Date().toISOString(),
            });
          }
        }
        if (rows.length > 0) await _sb.from('product_questions').upsert(rows);
        return true;
      }

      // ── Historique récent ─────────────────────────────────────────────────
      if (key === 'recently_viewed' && _sb && _userId) {
        const viewed = Array.isArray(value) ? value : [];
        const rows = viewed
          .map(v => ({
            user_id:    _userId,
            product_id: typeof v === 'string' ? v : (v.id || v.product_id),
            viewed_at:  v.viewedAt || v.viewed_at || new Date().toISOString(),
          }))
          .filter(r => r.product_id);
        if (rows.length > 0) {
          await _sb.from('recently_viewed')
            .upsert(rows, { onConflict: 'user_id,product_id' });
        }
        return true;
      }

    } catch (e) {
      console.warn(`[SupabaseStorage] Supabase write failed (${key}):`, e.message);
      return false; // Fallback localStorage
    }

    // Clé non gérée par Supabase → localStorage
    return false;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // API PUBLIQUE
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * get(key) — Lecture priorité : localStorage (cache), puis Supabase si vide.
   * Retourne la valeur synchrone du cache immédiatement + hydrate en arrière-plan.
   */
  async function get(key) {
    // Toujours localStorage pour les clés UI
    if (isLsOnly(key)) return _lsGet(key);

    // Retourner le cache immédiatement
    const cached = _lsGet(key);

    // Hydratation Supabase en arrière-plan (sans bloquer)
    _hydrateFromSupabase(key).catch(() => {});

    return cached;
  }

  /** Version synchrone — retourne UNIQUEMENT le cache localStorage (zéro latence) */
  function getSync(key) {
    return _lsGet(key);
  }

  /** getArray — retourne toujours un tableau */
  async function getArray(key) {
    const v = await get(key);
    if (!v) return [];
    if (Array.isArray(v)) return v;
    if (typeof v === 'object') return Object.values(v);
    return [];
  }

  /** getArray synchrone (cache local) */
  function getArraySync(key) {
    const v = getSync(key);
    if (!v) return [];
    if (Array.isArray(v)) return v;
    if (typeof v === 'object') return Object.values(v);
    return [];
  }

  /**
   * set(key, value) — Écriture : localStorage en premier (synchrone),
   *                              puis Supabase en arrière-plan (async).
   */
  async function set(key, value) {
    // 1. Écrire dans localStorage immédiatement (compatibilité rétro)
    _lsSet(key, value);

    // 2. Ne pas pousser les clés UI/tokens vers Supabase
    if (isLsOnly(key)) return true;

    // 3. Persister vers Supabase en arrière-plan
    _persistToSupabase(key, value).catch(() => {});

    return true;
  }

  /**
   * delete(key) — Suppression : localStorage + Supabase
   */
  async function del(key) {
    _lsDelete(key);
    if (isLsOnly(key)) return true;

    _init();
    if (!_sb || !_userId) return true;

    try {
      if (key === 'wishlists') {
        await _sb.from('wishlists').delete().eq('user_id', _userId);
      } else if (key === 'stock_alerts') {
        await _sb.from('stock_alerts').delete().eq('user_id', _userId);
      } else if (key === 'recently_viewed') {
        await _sb.from('recently_viewed').delete().eq('user_id', _userId);
      }
    } catch { /* ignore */ }

    return true;
  }

  // ── Hydratation Supabase → localStorage cache ──────────────────────────────
  async function _hydrateFromSupabase(key) {
    _init();
    if (!_userId) return;

    try {
      if (key === 'wishlists' && _sb) {
        const { data } = await _sb.from('wishlists')
          .select('product_id').eq('user_id', _userId);
        if (data) {
          const ids = data.map(r => r.product_id);
          const ws = _lsGet('wishlists') || {};
          ws[_userId] = ids;
          _lsSet('wishlists', ws);
        }
        return;
      }

      if (key === 'stock_alerts' && _sb) {
        const { data } = await _sb.from('stock_alerts')
          .select('product_id').eq('user_id', _userId);
        if (data) {
          const existing = _lsGet('stock_alerts') || [];
          const others = existing.filter(a => (a.userId || a.user_id) !== _userId);
          const myAlerts = data.map(r => ({ userId: _userId, productId: r.product_id }));
          _lsSet('stock_alerts', [...others, ...myAlerts]);
        }
        return;
      }

      if (key === 'loyalty_points' && _sb) {
        const { data } = await _sb.from('loyalty_points')
          .select('points').eq('user_id', _userId).maybeSingle();
        if (data) {
          const pts = _lsGet('loyalty_points') || {};
          pts[_userId] = data.points;
          _lsSet('loyalty_points', pts);
        }
        return;
      }

      if (key === 'notifications' && _sb) {
        const { data } = await _sb.from('notifications')
          .select('*').eq('user_id', _userId).order('created_at', { ascending: false }).limit(50);
        if (data) {
          const all = _lsGet('notifications') || {};
          all[_userId] = data;
          _lsSet('notifications', all);
        }
        return;
      }

      if (key === 'recently_viewed' && _sb) {
        const { data } = await _sb.from('recently_viewed')
          .select('product_id, viewed_at').eq('user_id', _userId)
          .order('viewed_at', { ascending: false }).limit(20);
        if (data) {
          _lsSet('recently_viewed', data.map(r => ({ id: r.product_id, viewedAt: r.viewed_at })));
        }
        return;
      }

    } catch { /* ignore — fallback localStorage déjà utilisé */ }
  }

  /**
   * invalidate(key) — Force une re-hydratation Supabase → cache pour une clé.
   * Utile après une mutation serveur pour rafraîchir le cache local.
   */
  async function invalidate(key) {
    _lsDelete(key);
    await _hydrateFromSupabase(key).catch(() => {});
  }

  /**
   * syncAll() — Hydrate toutes les clés depuis Supabase.
   * À appeler après login pour initialiser le cache.
   */
  async function syncAll() {
    _init();
    if (!_userId) return;

    const keys = ['wishlists', 'stock_alerts', 'loyalty_points', 'notifications', 'recently_viewed'];
    await Promise.allSettled(keys.map(k => _hydrateFromSupabase(k)));
    console.info('[SupabaseStorage] ✅ Sync complète depuis Supabase');
  }

  // ══════════════════════════════════════════════════════════════════════════
  // COMPATIBILITÉ RÉTRO avec l'API synchrone `storage` (index.html)
  // ══════════════════════════════════════════════════════════════════════════
  //
  // Le code existant appelle storage.get(), storage.set(), storage.getArray()
  // de manière SYNCHRONE. Pour une migration sans réécriture totale :
  //   - get/getArray retournent la valeur localStorage SYNCHRONE (cache)
  //   - set() écrit en localStorage + lance Supabase en arrière-plan
  //   - Les données sont toujours disponibles immédiatement depuis le cache
  //
  // ⚠ Cette API de compatibilité utilise le cache localStorage.
  //   Pour lire depuis Supabase, appeler syncAll() après login.

  const compat = {
    get(key)           { return _lsGet(key); },
    getArray(key)      { return getArraySync(key); },
    set(key, value)    { _lsSet(key, value); _persistToSupabase(key, value).catch(() => {}); return true; },
    delete(key)        { return _lsDelete(key); },
  };

  // ══════════════════════════════════════════════════════════════════════════
  // PATCH GLOBAL — Remplace `storage` dans index.html sans modifier chaque appel
  // ══════════════════════════════════════════════════════════════════════════
  //
  // Ajouter dans index.html APRÈS la définition de `const storage = { ... }`
  // et APRÈS l'initialisation Supabase :
  //
  //   Object.assign(storage, SupabaseStorage.compat);
  //   SupabaseStorage.setUser(currentUser);
  //   SupabaseStorage.syncAll();

  return {
    // API async complète (recommandée pour nouveau code)
    get, getSync, getArray, getArraySync,
    set, delete: del, invalidate, syncAll,
    // Config
    setUser, init: _init,
    // Compatibilité drop-in pour l'ancien code synchrone
    compat,
    // Exposer les helpers pour les tests
    _lsGet, _lsSet, _lsDelete,
  };
})();

// ── Auto-intégration avec le système auth NEXUS ───────────────────────────────
// Écouter l'événement de login pour initialiser le storage avec l'utilisateur
document.addEventListener('nexus-user-logged-in', (e) => {
  const user = e.detail?.user;
  if (user?.id) {
    SupabaseStorage.setUser(user);
    // Patcher l'objet `storage` existant pour écrire vers Supabase en background
    if (typeof storage !== 'undefined') {
      Object.assign(storage, SupabaseStorage.compat);
      console.info('[SupabaseStorage] ✅ storage patché → Supabase actif en arrière-plan');
    }
    // Synchroniser le cache local depuis Supabase
    SupabaseStorage.syncAll();

    // Lancer la migration localStorage → Supabase si pas encore faite
    const migKey = `nexus_migration_done_v1_${user.id}`;
    if (!localStorage.getItem(migKey) && typeof NexusMigration !== 'undefined') {
      const apiUrl = (typeof NEXUS_CONFIG !== 'undefined') ? NEXUS_CONFIG.apiUrl : '';
      const sbClient = window._supabase || window.supabase_client;
      NexusMigration.run(user, sbClient, apiUrl)
        .then(report => {
          // Nettoyer le localStorage UNIQUEMENT si aucune erreur critique
          const hasErrors = report && Object.values(report).some(r => r.error);
          if (!hasErrors) {
            NexusMigration.cleanup(user.id);
          } else {
            console.warn('[SupabaseStorage] Migration partielle — localStorage conservé (erreurs détectées)', report);
          }
          localStorage.setItem(migKey, Date.now().toString());
          console.info('[SupabaseStorage] Migration one-shot terminée.', report);
        })
        .catch(err => console.error('[SupabaseStorage] Erreur migration:', err));
    }
  }
});

document.addEventListener('nexus-user-logged-out', () => {
  SupabaseStorage.setUser(null);
  // Restaurer le storage localStorage pur pour le mode guest
  if (typeof storage !== 'undefined') {
    storage.get      = function(k) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch { return null; } };
    storage.getArray = function(k) { const v = this.get(k); if (!v) return []; if (Array.isArray(v)) return v; if (typeof v === 'object') return Object.values(v); return []; };
    storage.set      = function(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } };
    storage.delete   = function(k) { try { localStorage.removeItem(k); return true; } catch { return false; } };
  }
  console.info('[SupabaseStorage] Utilisateur déconnecté — retour mode localStorage guest');
});

window.SupabaseStorage = SupabaseStorage;
console.info('[NEXUS] SupabaseStorage v1.0.0 chargé');
