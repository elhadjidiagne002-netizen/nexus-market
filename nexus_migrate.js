/**
 * ══════════════════════════════════════════════════════════════════════════════
 * NEXUS Market — Migration localStorage → Supabase v1.0.0
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * USAGE (à insérer juste après l'initialisation de Supabase dans index.html,
 *        et à appeler UNE SEULE FOIS après connexion de l'utilisateur) :
 *
 *   // Après login réussi :
 *   if (!localStorage.getItem('nexus_migration_done_v1')) {
 *     NexusMigration.run(currentUser, supabaseClient, apiUrl).then(report => {
 *       console.log('[Migration]', report);
 *       localStorage.setItem('nexus_migration_done_v1', '1');
 *     });
 *   }
 *
 * SÉCURITÉ :
 *   - Toutes les mutations passent par l'API backend (JWT obligatoire).
 *   - Le script ne lit QUE les données qui appartiennent à l'utilisateur connecté.
 *   - Les données sans userId sont ignorées (données demo/anonymes).
 *   - Idempotent : le flag nexus_migration_done_v1 évite une double migration.
 *
 * Ce fichier peut être chargé via <script defer src="nexus_migrate.js"></script>
 * ou inliné dans index.html avant le bootstrap de l'app.
 * ══════════════════════════════════════════════════════════════════════════════
 */

const NexusMigration = (() => {
  // ── Helpers ────────────────────────────────────────────────────────────────

  /** Lire le localStorage en sécurité */
  function lsGet(key) {
    try {
      const v = localStorage.getItem(key);
      return v ? JSON.parse(v) : null;
    } catch { return null; }
  }

  /** Retourne toujours un tableau */
  function lsGetArray(key) {
    const v = lsGet(key);
    if (!v) return [];
    if (Array.isArray(v)) return v;
    if (typeof v === 'object') return Object.values(v);
    return [];
  }

  /** POST/PATCH vers l'API backend avec JWT */
  async function apiPost(apiUrl, jwt, path, body, method = 'POST') {
    const res = await fetch(`${apiUrl}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${jwt}`,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(`${method} ${path} → ${res.status}: ${err.error || res.statusText}`);
    }
    return res.json().catch(() => ({}));
  }

  /** Upsert direct via le client Supabase JS (fallback si pas d'endpoint API) */
  async function sbUpsert(sb, table, rows, conflictCol = null) {
    if (!rows || rows.length === 0) return { count: 0 };
    const opts = conflictCol ? { onConflict: conflictCol } : {};
    const { data, error } = await sb.from(table).upsert(rows, opts);
    if (error) throw new Error(`upsert ${table}: ${error.message}`);
    return { count: (data || rows).length };
  }

  // ── Rapport de migration ────────────────────────────────────────────────────
  function createReport() {
    const items = {};
    return {
      add(key, migrated, skipped, error = null) {
        items[key] = { migrated, skipped, error };
      },
      toJSON() { return items; },
      summary() {
        const total = Object.values(items).reduce((s, v) => s + v.migrated, 0);
        const errors = Object.entries(items).filter(([, v]) => v.error);
        return `Migration terminée : ${total} enregistrements migrés. ` +
          (errors.length ? `⚠ Erreurs : ${errors.map(([k]) => k).join(', ')}` : '✅ Aucune erreur.');
      },
    };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // MODULES DE MIGRATION — un par entité
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Panier (cart_<userId>) → table `carts`
   */
  async function migrateCart(userId, apiUrl, jwt) {
    const items = lsGet(`cart_${userId}`) || [];
    if (items.length === 0) return { migrated: 0, skipped: 0 };
    try {
      await apiPost(apiUrl, jwt, '/api/cart/migrate', { items });
      return { migrated: items.length, skipped: 0 };
    } catch (e) {
      return { migrated: 0, skipped: items.length, error: e.message };
    }
  }

  /**
   * Wishlists (wishlists[userId]) → table `wishlists`
   * Via Supabase direct (pas d'endpoint batch dans server.js)
   */
  async function migrateWishlists(userId, sb, apiUrl, jwt) {
    const ws = lsGet('wishlists') || {};
    const ids = Array.isArray(ws[userId]) ? ws[userId] : Object.values(ws[userId] || {});
    if (ids.length === 0) return { migrated: 0, skipped: 0 };

    let migrated = 0, skipped = 0;
    for (const productId of ids) {
      if (!productId || typeof productId !== 'string') { skipped++; continue; }
      try {
        await apiPost(apiUrl, jwt, '/api/wishlists', { productId });
        migrated++;
      } catch (e) {
        // 409 = déjà présent → OK
        if (String(e.message).includes('409') || String(e.message).includes('already')) migrated++;
        else skipped++;
      }
    }
    return { migrated, skipped };
  }

  /**
   * Alertes stock (stock_alerts) → table `stock_alerts`
   */
  async function migrateStockAlerts(userId, apiUrl, jwt) {
    const all = lsGetArray('stock_alerts').filter(a => a.userId === userId || !a.userId);
    if (all.length === 0) return { migrated: 0, skipped: 0 };

    let migrated = 0, skipped = 0;
    for (const a of all) {
      const productId = a.productId || a.product_id;
      if (!productId) { skipped++; continue; }
      try {
        await apiPost(apiUrl, jwt, '/api/stock-alerts', { productId });
        migrated++;
      } catch { skipped++; }
    }
    return { migrated, skipped };
  }

  /**
   * Points de fidélité (loyalty_points[userId]) → table `loyalty_points`
   * Via Supabase direct (pas d'endpoint POST dans server.js)
   */
  async function migrateLoyaltyPoints(userId, sb) {
    const pts = lsGet('loyalty_points') || {};
    const points = pts[userId];
    if (points === undefined || points === null) return { migrated: 0, skipped: 0 };

    try {
      const { error } = await sb.from('loyalty_points')
        .upsert({ user_id: userId, points: Number(points) || 0, updated_at: new Date().toISOString() },
                 { onConflict: 'user_id' });
      if (error) throw new Error(error.message);
      return { migrated: 1, skipped: 0 };
    } catch (e) {
      return { migrated: 0, skipped: 1, error: e.message };
    }
  }

  /**
   * Notifications (notifications[userId]) → table `notifications`
   */
  async function migrateNotifications(userId, sb) {
    const all = lsGet('notifications') || {};
    const notifs = Array.isArray(all[userId]) ? all[userId] : Object.values(all[userId] || {});
    if (notifs.length === 0) return { migrated: 0, skipped: 0 };

    const rows = notifs.map(n => ({
      user_id:    userId,
      type:       n.type    || 'info',
      title:      n.title   || n.message || 'Notification',
      message:    n.message || n.title   || null,
      link:       n.link    || null,
      read:       !!n.read,
      created_at: n.createdAt || n.created_at || new Date().toISOString(),
    }));

    try {
      const { error } = await sb.from('notifications').upsert(rows);
      if (error) throw new Error(error.message);
      return { migrated: rows.length, skipped: 0 };
    } catch (e) {
      return { migrated: 0, skipped: rows.length, error: e.message };
    }
  }

  /**
   * Questions produits (product_qa) → table `product_questions`
   */
  async function migrateProductQA(userId, sb) {
    const qa = lsGet('product_qa') || {};
    const rows = [];

    for (const [productId, questions] of Object.entries(qa)) {
      if (!Array.isArray(questions)) continue;
      for (const q of questions) {
        if (!q.question) continue;
        rows.push({
          product_id:  productId,
          user_id:     q.userId || userId,
          user_name:   q.userName || q.user_name || null,
          question:    q.question,
          answer:      q.answer || null,
          answered_at: q.answeredAt || q.answered_at || null,
          visible:     q.visible !== false,
          created_at:  q.createdAt || q.created_at || new Date().toISOString(),
        });
      }
    }

    if (rows.length === 0) return { migrated: 0, skipped: 0 };

    try {
      const { error } = await sb.from('product_questions').upsert(rows);
      if (error) throw new Error(error.message);
      return { migrated: rows.length, skipped: 0 };
    } catch (e) {
      return { migrated: 0, skipped: rows.length, error: e.message };
    }
  }

  /**
   * Recently viewed → table `recently_viewed`
   */
  async function migrateRecentlyViewed(userId, sb) {
    const viewed = lsGetArray('recently_viewed');
    if (viewed.length === 0) return { migrated: 0, skipped: 0 };

    const rows = viewed
      .filter(v => v && (typeof v === 'string' || v.id))
      .map(v => ({
        user_id:    userId,
        product_id: typeof v === 'string' ? v : (v.id || v.product_id),
        viewed_at:  v.viewedAt || v.viewed_at || new Date().toISOString(),
      }))
      .filter(r => r.product_id);

    if (rows.length === 0) return { migrated: 0, skipped: 0 };

    try {
      const { error } = await sb.from('recently_viewed')
        .upsert(rows, { onConflict: 'user_id,product_id', ignoreDuplicates: true });
      if (error) throw new Error(error.message);
      return { migrated: rows.length, skipped: 0 };
    } catch (e) {
      return { migrated: 0, skipped: rows.length, error: e.message };
    }
  }

  /**
   * Commandes locales (orders) → via API
   * Seulement les commandes sans ID serveur (créées offline)
   */
  async function migrateOrders(userId, apiUrl, jwt) {
    const all = lsGetArray('orders').filter(o =>
      (o.buyerId === userId || o.buyer_id === userId) &&
      o._localOnly === true   // seulement les commandes créées en mode offline
    );
    if (all.length === 0) return { migrated: 0, skipped: 0 };

    let migrated = 0, skipped = 0;
    for (const order of all) {
      try {
        await apiPost(apiUrl, jwt, '/api/orders', {
          items:           order.items,
          total:           order.total,
          paymentMethod:   order.paymentMethod || order.payment_method,
          deliveryAddress: order.deliveryAddress || order.delivery_address,
          couponCode:      order.couponCode || order.coupon_code || null,
          vendorId:        order.vendorId || order.vendor_id,
        });
        migrated++;
      } catch { skipped++; }
    }
    return { migrated, skipped };
  }

  /**
   * Messages locaux → via API
   * Seulement les messages non encore synchronisés (sans _serverSynced)
   */
  async function migrateMessages(userId, apiUrl, jwt) {
    const all = lsGetArray('messages').filter(m =>
      (m.from === userId || m.fromId === userId || m.from_id === userId) &&
      !m._serverSynced
    );
    if (all.length === 0) return { migrated: 0, skipped: 0 };

    let migrated = 0, skipped = 0;
    for (const msg of all) {
      try {
        await apiPost(apiUrl, jwt, '/api/messages', {
          toId:    msg.to || msg.toId || msg.to_id,
          content: msg.content || msg.text || msg.body,
        });
        migrated++;
      } catch { skipped++; }
    }
    return { migrated, skipped };
  }

  /**
   * Litiges locaux → via API
   */
  async function migrateDisputes(userId, apiUrl, jwt) {
    const all = lsGetArray('disputes').filter(d =>
      (d.buyerId === userId || d.buyer_id === userId) && d._localOnly
    );
    if (all.length === 0) return { migrated: 0, skipped: 0 };

    let migrated = 0, skipped = 0;
    for (const d of all) {
      try {
        await apiPost(apiUrl, jwt, '/api/disputes', {
          orderId:     d.orderId || d.order_id,
          reason:      d.reason,
          description: d.description,
        });
        migrated++;
      } catch { skipped++; }
    }
    return { migrated, skipped };
  }

  /**
   * Offres locales → via API
   */
  async function migrateOffers(userId, apiUrl, jwt) {
    const all = lsGetArray('offers').filter(o =>
      (o.buyerId === userId || o.buyer_id === userId) && o._localOnly
    );
    if (all.length === 0) return { migrated: 0, skipped: 0 };

    let migrated = 0, skipped = 0;
    for (const o of all) {
      try {
        await apiPost(apiUrl, jwt, '/api/offers', {
          productId:    o.productId || o.product_id,
          offeredPrice: o.offeredPrice || o.offered_price,
          quantity:     o.quantity || 1,
          message:      o.message || null,
        });
        migrated++;
      } catch { skipped++; }
    }
    return { migrated, skipped };
  }

  /**
   * Demandes de retour locales → via API
   */
  async function migrateReturnRequests(userId, apiUrl, jwt) {
    const all = lsGetArray('return_requests').filter(r =>
      (r.buyerId === userId || r.buyer_id === userId) && r._localOnly
    );
    if (all.length === 0) return { migrated: 0, skipped: 0 };

    let migrated = 0, skipped = 0;
    for (const r of all) {
      try {
        await apiPost(apiUrl, jwt, '/api/returns', {
          orderId:     r.orderId || r.order_id,
          reason:      r.reason,
          description: r.description,
        });
        migrated++;
      } catch { skipped++; }
    }
    return { migrated, skipped };
  }

  /**
   * Demandes de retrait vendeur → via API (admin + vendeur)
   */
  async function migratePayoutRequests(userId, apiUrl, jwt) {
    const all = lsGetArray('payout_requests').filter(p =>
      (p.vendorId === userId || p.vendor_id === userId) && p._localOnly
    );
    if (all.length === 0) return { migrated: 0, skipped: 0 };

    let migrated = 0, skipped = 0;
    for (const p of all) {
      try {
        await apiPost(apiUrl, jwt, '/api/payouts/requests', {
          amount:      p.amount,
          method:      p.method,
          provider:    p.provider,
          destination: p.destination,
        });
        migrated++;
      } catch { skipped++; }
    }
    return { migrated, skipped };
  }

  /**
   * Avis locaux → via API
   */
  async function migrateReviews(userId, apiUrl, jwt) {
    const all = lsGetArray('reviews').filter(r =>
      (r.userId === userId || r.user_id === userId) && r._localOnly
    );
    if (all.length === 0) return { migrated: 0, skipped: 0 };

    let migrated = 0, skipped = 0;
    for (const r of all) {
      try {
        await apiPost(apiUrl, jwt, '/api/reviews', {
          productId: r.productId || r.product_id,
          vendorId:  r.vendorId  || r.vendor_id,
          rating:    r.rating,
          comment:   r.comment,
        });
        migrated++;
      } catch { skipped++; }
    }
    return { migrated, skipped };
  }

  /**
   * Parrainages → via API
   */
  async function migrateReferrals(userId, apiUrl, jwt) {
    const all = lsGetArray('referrals').filter(r =>
      (r.referrerId === userId || r.referrer_id === userId) && r._localOnly
    );
    if (all.length === 0) return { migrated: 0, skipped: 0 };

    let migrated = 0, skipped = 0;
    for (const r of all) {
      try {
        await apiPost(apiUrl, jwt, '/api/referrals', {
          referredId: r.referredId || r.referred_id,
          code:       r.code,
        });
        migrated++;
      } catch { skipped++; }
    }
    return { migrated, skipped };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // NETTOYAGE POST-MIGRATION
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Supprimer les données migrées du localStorage.
   * Appeler APRÈS run() si report indique succès global.
   */
  function cleanup(userId) {
    // Données par utilisateur
    const userKeys = [
      `cart_${userId}`,
    ];
    // Données globales dont les éléments de l'utilisateur ont été migrés
    const mergeKeys = [
      'wishlists', 'stock_alerts', 'loyalty_points',
      'notifications', 'recently_viewed',
    ];
    // Données entièrement transférées (fallback local uniquement)
    const fullKeys = ['product_qa'];

    userKeys.forEach(k => {
      try { localStorage.removeItem(k); } catch { /* ignore */ }
    });

    // Pour les clés mixtes : retirer seulement les entrées de l'utilisateur
    mergeKeys.forEach(key => {
      try {
        const data = lsGet(key);
        if (!data) return;
        if (Array.isArray(data)) {
          // Retirer les alertes/entrées de cet utilisateur
          const filtered = data.filter(item => (item.userId || item.user_id) !== userId);
          if (filtered.length > 0) localStorage.setItem(key, JSON.stringify(filtered));
          else localStorage.removeItem(key);
        } else if (typeof data === 'object') {
          // Retirer la clé userId
          delete data[userId];
          if (Object.keys(data).length > 0) localStorage.setItem(key, JSON.stringify(data));
          else localStorage.removeItem(key);
        }
      } catch { /* ignore */ }
    });

    fullKeys.forEach(k => {
      try { localStorage.removeItem(k); } catch { /* ignore */ }
    });

    console.info(`[NexusMigration] 🗑 Données localStorage nettoyées pour user ${userId}`);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // POINT D'ENTRÉE PRINCIPAL
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * @param {object} currentUser   - { id, role, ... }
   * @param {object} supabaseClient - Client Supabase JS initialisé
   * @param {string} apiUrl         - URL du backend (ex: https://nexus-market-api.onrender.com)
   * @param {string} [jwt]          - JWT access token (lu depuis sessionStorage si absent)
   * @returns {Promise<object>}     - Rapport de migration
   */
  async function run(currentUser, supabaseClient, apiUrl, jwt) {
    if (!currentUser?.id) {
      console.warn('[NexusMigration] Aucun utilisateur connecté — migration ignorée.');
      return {};
    }

    const userId = currentUser.id;
    const token = jwt ||
      sessionStorage.getItem('nexus_jwt') ||
      localStorage.getItem('nexus_jwt');

    if (!token) {
      console.warn('[NexusMigration] JWT introuvable — migration ignorée.');
      return {};
    }

    const report = createReport();
    console.info(`[NexusMigration] ▶ Démarrage migration pour user ${userId}…`);

    const tasks = [
      ['cart',            () => migrateCart(userId, apiUrl, token)],
      ['wishlists',       () => migrateWishlists(userId, supabaseClient, apiUrl, token)],
      ['stock_alerts',    () => migrateStockAlerts(userId, apiUrl, token)],
      ['loyalty_points',  () => migrateLoyaltyPoints(userId, supabaseClient)],
      ['notifications',   () => migrateNotifications(userId, supabaseClient)],
      ['product_qa',      () => migrateProductQA(userId, supabaseClient)],
      ['recently_viewed', () => migrateRecentlyViewed(userId, supabaseClient)],
      ['orders',          () => migrateOrders(userId, apiUrl, token)],
      ['messages',        () => migrateMessages(userId, apiUrl, token)],
      ['disputes',        () => migrateDisputes(userId, apiUrl, token)],
      ['offers',          () => migrateOffers(userId, apiUrl, token)],
      ['return_requests', () => migrateReturnRequests(userId, apiUrl, token)],
      ['payout_requests', () => migratePayoutRequests(userId, apiUrl, token)],
      ['reviews',         () => migrateReviews(userId, apiUrl, token)],
      ['referrals',       () => migrateReferrals(userId, apiUrl, token)],
    ];

    for (const [name, fn] of tasks) {
      try {
        const result = await fn();
        report.add(name, result.migrated || 0, result.skipped || 0, result.error || null);
        if ((result.migrated || 0) > 0) {
          console.info(`[NexusMigration] ✅ ${name}: ${result.migrated} migrés`);
        }
      } catch (e) {
        report.add(name, 0, 0, e.message);
        console.warn(`[NexusMigration] ⚠ ${name} failed:`, e.message);
      }
    }

    const summary = report.summary();
    console.info(`[NexusMigration] ${summary}`);

    return report.toJSON();
  }

  // ══════════════════════════════════════════════════════════════════════════
  // API PUBLIQUE
  // ══════════════════════════════════════════════════════════════════════════
  return {
    run,
    cleanup,
    // Accès aux modules individuels pour tests/debug
    modules: {
      migrateCart, migrateWishlists, migrateStockAlerts, migrateLoyaltyPoints,
      migrateNotifications, migrateProductQA, migrateRecentlyViewed,
      migrateOrders, migrateMessages, migrateDisputes, migrateOffers,
      migrateReturnRequests, migratePayoutRequests, migrateReviews, migrateReferrals,
    },
  };
})();

// ── Intégration automatique au login ─────────────────────────────────────────
// À placer dans le handler onAuthStateChange de votre app, ou après login :
//
// document.addEventListener('nexus-user-logged-in', async (e) => {
//   const { user } = e.detail;
//   const migKey = `nexus_migration_done_v1_${user.id}`;
//   if (!localStorage.getItem(migKey)) {
//     try {
//       await NexusMigration.run(user, window._supabase, NEXUS_CONFIG.apiUrl);
//       NexusMigration.cleanup(user.id);
//       localStorage.setItem(migKey, Date.now().toString());
//     } catch (err) {
//       console.error('[NexusMigration] Erreur critique:', err);
//     }
//   }
// });

window.NexusMigration = NexusMigration;
console.info('[NEXUS] NexusMigration v1.0.0 chargé');
