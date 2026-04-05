/**
 * NEXUS Market — Analytics Vendeurs v1.0
 * =========================================
 * Coller ce bloc dans server.js AVANT la ligne "─── HEALTH CHECK ───"
 * (juste avant app.get('/api/health', ...))
 *
 * Dépendances déjà présentes dans server.js :
 *   verifyToken, requireRole, supabase, formatFCFA
 *
 * Nouvelles routes ajoutées :
 *   GET  /api/vendor/analytics/overview        KPIs globaux toutes périodes
 *   GET  /api/vendor/analytics/revenue         Série temporelle revenus
 *   GET  /api/vendor/analytics/products        Performance par produit
 *   GET  /api/vendor/analytics/customers       Analyse acheteurs
 *   GET  /api/vendor/analytics/reviews         Distribution des avis
 *   POST /api/vendor/analytics/view            Enregistrer une vue produit
 *   POST /api/vendor/analytics/refresh         Rafraîchir cache (admin seulement)
 *   GET  /api/vendor/stats                     Stats légères (tableau de bord rapide)
 */

// ─── ANALYTICS VENDEURS ───────────────────────────────────────────────────────

/**
 * GET /api/vendor/analytics/overview
 * Retourne les KPIs globaux du vendeur connecté + comparaison avec la période précédente.
 * Paramètre optionnel : ?compare=true (ajoute la variation %)
 */
app.get('/api/vendor/analytics/overview', verifyToken, requireRole('vendor', 'admin'), async (req, res) => {
  const vendorId = req.query.vendor_id && req.user.role === 'admin'
    ? req.query.vendor_id
    : req.user.id;

  try {
    // --- Données all-time ---
    const { data: allOrders, error: errO } = await supabase
      .from('orders')
      .select('id, total, commission, status, buyer_id, created_at, products')
      .eq('vendor_id', vendorId);
    if (errO) throw errO;

    const delivered  = (allOrders || []).filter(o => o.status === 'delivered');
    const cancelled  = (allOrders || []).filter(o => o.status === 'cancelled');
    const pending    = (allOrders || []).filter(o => ['pending_payment', 'processing'].includes(o.status));

    const totalRevenue   = delivered.reduce((s, o) => s + (o.total || 0), 0);
    const totalCommission= delivered.reduce((s, o) => s + (o.commission || 0), 0);
    const netRevenue     = totalRevenue - totalCommission;
    const avgBasket      = delivered.length > 0 ? totalRevenue / delivered.length : 0;
    const uniqueBuyers   = new Set(delivered.map(o => o.buyer_id)).size;
    const cancelRate     = allOrders.length > 0
      ? Math.round((cancelled.length / allOrders.length) * 1000) / 10 : 0;

    // Units sold
    const unitsSold = delivered.reduce((sum, o) => {
      return sum + (o.products || []).reduce((s, p) => s + (p.quantity || 1), 0);
    }, 0);

    // --- Période 30 jours ---
    const now    = Date.now();
    const ms30   = 30 * 24 * 3600 * 1000;
    const ms60   = 60 * 24 * 3600 * 1000;

    const recent30   = delivered.filter(o => new Date(o.created_at) > new Date(now - ms30));
    const previous30 = delivered.filter(o => {
      const d = new Date(o.created_at);
      return d > new Date(now - ms60) && d <= new Date(now - ms30);
    });

    const rev30  = recent30.reduce((s, o) => s + o.total, 0);
    const prevRev= previous30.reduce((s, o) => s + o.total, 0);
    const revGrowth = prevRev > 0 ? Math.round(((rev30 - prevRev) / prevRev) * 1000) / 10 : null;

    // --- Période 7 jours ---
    const ms7    = 7 * 24 * 3600 * 1000;
    const ms14   = 14 * 24 * 3600 * 1000;
    const recent7    = delivered.filter(o => new Date(o.created_at) > new Date(now - ms7));
    const previous7  = delivered.filter(o => {
      const d = new Date(o.created_at);
      return d > new Date(now - ms14) && d <= new Date(now - ms7);
    });
    const rev7    = recent7.reduce((s, o) => s + o.total, 0);
    const prevRev7= previous7.reduce((s, o) => s + o.total, 0);
    const revGrowth7 = prevRev7 > 0 ? Math.round(((rev7 - prevRev7) / prevRev7) * 1000) / 10 : null;

    // --- Produits actifs + avis ---
    const { data: products } = await supabase
      .from('products')
      .select('id, name, rating, reviews_count, stock, active, moderated')
      .eq('vendor_id', vendorId);

    const activeProducts = (products || []).filter(p => p.active && p.moderated).length;
    const lowStockCount  = (products || []).filter(p => p.active && p.moderated && p.stock <= 5).length;
    const avgRating      = (products || []).length > 0
      ? Math.round((products.reduce((s, p) => s + (p.rating || 0), 0) / products.length) * 10) / 10 : 0;
    const totalReviews   = (products || []).reduce((s, p) => s + (p.reviews_count || 0), 0);

    // --- Offres reçues ---
    const { count: pendingOffers } = await supabase
      .from('offers')
      .select('id', { count: 'exact', head: true })
      .eq('vendor_id', vendorId)
      .eq('status', 'pending');

    res.json({
      vendorId,
      allTime: {
        totalOrders      : delivered.length,
        cancelledOrders  : cancelled.length,
        pendingOrders    : pending.length,
        cancelRate,
        totalRevenue,
        totalCommissionPaid: totalCommission,
        netRevenue,
        avgBasket,
        uniqueBuyers,
        unitsSold,
        activeProducts,
        lowStockCount,
        avgRating,
        totalReviews,
        pendingOffers: pendingOffers || 0,
      },
      period30d: {
        revenue    : rev30,
        orders     : recent30.length,
        revGrowth,           // % vs 30j précédents (null si pas de données précédentes)
        uniqueBuyers: new Set(recent30.map(o => o.buyer_id)).size,
      },
      period7d: {
        revenue    : rev7,
        orders     : recent7.length,
        revGrowth  : revGrowth7,
      },
      generatedAt: new Date().toISOString(),
    });
  } catch (e) {
    console.error('[vendor-analytics-overview]', e);
    res.status(500).json({ error: e.message });
  }
});

/**
 * GET /api/vendor/analytics/revenue
 * Série temporelle quotidienne pour le graphique principal.
 *
 * Query params :
 *   period  = 7d | 30d | 90d | 365d  (défaut: 30d)
 *   group   = day | week | month      (défaut: day)
 */
app.get('/api/vendor/analytics/revenue', verifyToken, requireRole('vendor', 'admin'), async (req, res) => {
  const vendorId = req.query.vendor_id && req.user.role === 'admin'
    ? req.query.vendor_id
    : req.user.id;

  const periodMap = { '7d': 7, '30d': 30, '90d': 90, '365d': 365 };
  const days  = periodMap[req.query.period] || 30;
  const group = req.query.group || 'day';

  try {
    // Utiliser la fonction RPC pour la série temporelle
    const { data: series, error } = await supabase.rpc('get_vendor_revenue_series', {
      p_vendor_id: vendorId,
      p_days     : days,
    });
    if (error) throw error;

    // Regrouper par semaine ou mois si demandé
    let result = series || [];
    if (group === 'week') {
      const weeks = {};
      result.forEach(d => {
        const dt = new Date(d.day);
        const mon = new Date(dt);
        mon.setDate(dt.getDate() - dt.getDay() + 1);
        const key = mon.toISOString().slice(0, 10);
        if (!weeks[key]) weeks[key] = { day: key, revenue: 0, net_revenue: 0, orders: 0, units_sold: 0 };
        weeks[key].revenue     += parseFloat(d.revenue     || 0);
        weeks[key].net_revenue += parseFloat(d.net_revenue || 0);
        weeks[key].orders      += parseInt(d.orders        || 0);
        weeks[key].units_sold  += parseInt(d.units_sold    || 0);
      });
      result = Object.values(weeks).sort((a, b) => a.day.localeCompare(b.day));
    } else if (group === 'month') {
      const months = {};
      result.forEach(d => {
        const key = d.day.slice(0, 7);
        if (!months[key]) months[key] = { day: key + '-01', revenue: 0, net_revenue: 0, orders: 0, units_sold: 0 };
        months[key].revenue     += parseFloat(d.revenue     || 0);
        months[key].net_revenue += parseFloat(d.net_revenue || 0);
        months[key].orders      += parseInt(d.orders        || 0);
        months[key].units_sold  += parseInt(d.units_sold    || 0);
      });
      result = Object.values(months).sort((a, b) => a.day.localeCompare(b.day));
    }

    // Totaux de la période
    const totals = result.reduce((acc, d) => ({
      revenue    : acc.revenue     + parseFloat(d.revenue     || 0),
      net_revenue: acc.net_revenue + parseFloat(d.net_revenue || 0),
      orders     : acc.orders      + parseInt(d.orders        || 0),
      units_sold : acc.units_sold  + parseInt(d.units_sold    || 0),
    }), { revenue: 0, net_revenue: 0, orders: 0, units_sold: 0 });

    res.json({
      period : req.query.period || '30d',
      group,
      series : result,
      totals,
    });
  } catch (e) {
    console.error('[vendor-analytics-revenue]', e);
    res.status(500).json({ error: e.message });
  }
});

/**
 * GET /api/vendor/analytics/products
 * Classement des produits par revenus, ventes, taux de conversion.
 *
 * Query params :
 *   sort   = revenue | units | rating | conversion  (défaut: revenue)
 *   limit  = 5 | 10 | 20                            (défaut: 10)
 */
app.get('/api/vendor/analytics/products', verifyToken, requireRole('vendor', 'admin'), async (req, res) => {
  const vendorId = req.query.vendor_id && req.user.role === 'admin'
    ? req.query.vendor_id
    : req.user.id;

  const limit = Math.min(parseInt(req.query.limit) || 10, 50);
  const sort  = req.query.sort || 'revenue';

  try {
    // Récupérer tous les produits du vendeur
    const { data: products, error: errP } = await supabase
      .from('products')
      .select('id, name, category, price, stock, rating, reviews_count, image_url, active, moderated, created_at')
      .eq('vendor_id', vendorId)
      .eq('active', true);
    if (errP) throw errP;

    if (!products?.length) return res.json({ products: [], totals: {} });

    // Récupérer les commandes livrées du vendeur
    const { data: orders } = await supabase
      .from('orders')
      .select('id, total, commission, products, created_at')
      .eq('vendor_id', vendorId)
      .eq('status', 'delivered');

    // Agréger ventes par produit
    const productStats = {};
    (orders || []).forEach(order => {
      (order.products || []).forEach(item => {
        const pid = item.id;
        if (!productStats[pid]) {
          productStats[pid] = { units: 0, revenue: 0, orderCount: 0, lastSaleAt: null };
        }
        productStats[pid].units      += (item.quantity || 1);
        productStats[pid].revenue    += (item.price || 0) * (item.quantity || 1);
        productStats[pid].orderCount += 1;
        if (!productStats[pid].lastSaleAt || order.created_at > productStats[pid].lastSaleAt) {
          productStats[pid].lastSaleAt = order.created_at;
        }
      });
    });

    // Vues produits (si disponibles)
    const productIds = products.map(p => p.id);
    const { data: viewsData } = await supabase
      .from('product_views')
      .select('product_id')
      .in('product_id', productIds);

    const viewCounts = {};
    (viewsData || []).forEach(v => {
      viewCounts[v.product_id] = (viewCounts[v.product_id] || 0) + 1;
    });

    // Assembler + calculer métriques
    const enriched = products.map(p => {
      const stats   = productStats[p.id] || { units: 0, revenue: 0, orderCount: 0, lastSaleAt: null };
      const views   = viewCounts[p.id] || 0;
      const conversion = views > 0 ? Math.round((stats.orderCount / views) * 10000) / 100 : 0;

      return {
        id          : p.id,
        name        : p.name,
        category    : p.category,
        price       : p.price,
        stock       : p.stock,
        rating      : p.rating,
        reviews     : p.reviews_count,
        imageUrl    : p.image_url,
        moderated   : p.moderated,
        createdAt   : p.created_at,
        revenue     : Math.round(stats.revenue * 100) / 100,
        unitsSold   : stats.units,
        orderCount  : stats.orderCount,
        views,
        conversion,
        lastSaleAt  : stats.lastSaleAt,
        // Score composite pour le tri
        score       : stats.revenue + (p.rating * 10) + (stats.units * 0.5),
      };
    });

    // Tri
    const sortMap = {
      revenue   : (a, b) => b.revenue    - a.revenue,
      units     : (a, b) => b.unitsSold  - a.unitsSold,
      rating    : (a, b) => b.rating     - a.rating,
      conversion: (a, b) => b.conversion - a.conversion,
    };
    enriched.sort(sortMap[sort] || sortMap.revenue);

    const topN  = enriched.slice(0, limit);
    const total = enriched.reduce((acc, p) => ({
      revenue  : acc.revenue   + p.revenue,
      unitsSold: acc.unitsSold + p.unitsSold,
      views    : acc.views     + p.views,
    }), { revenue: 0, unitsSold: 0, views: 0 });

    // Ajouter la part relative dans les revenus
    topN.forEach(p => {
      p.revenueShare = total.revenue > 0
        ? Math.round((p.revenue / total.revenue) * 1000) / 10 : 0;
    });

    res.json({
      products: topN,
      totals  : total,
      sort,
      limit,
    });
  } catch (e) {
    console.error('[vendor-analytics-products]', e);
    res.status(500).json({ error: e.message });
  }
});

/**
 * GET /api/vendor/analytics/customers
 * Analyse des acheteurs : fidélité, géographie, fréquence.
 */
app.get('/api/vendor/analytics/customers', verifyToken, requireRole('vendor', 'admin'), async (req, res) => {
  const vendorId = req.query.vendor_id && req.user.role === 'admin'
    ? req.query.vendor_id
    : req.user.id;

  try {
    const { data: orders, error } = await supabase
      .from('orders')
      .select('id, buyer_id, buyer_name, total, status, created_at, shipping_city')
      .eq('vendor_id', vendorId)
      .eq('status', 'delivered')
      .order('created_at', { ascending: false });
    if (error) throw error;

    if (!orders?.length) {
      return res.json({
        totalUniqueCustomers: 0, newCustomers30d: 0, returningRate: 0,
        topCustomers: [], cityBreakdown: [], cohortData: []
      });
    }

    // Map acheteurs
    const customerMap = {};
    orders.forEach(o => {
      if (!customerMap[o.buyer_id]) {
        customerMap[o.buyer_id] = {
          buyerId   : o.buyer_id,
          name      : o.buyer_name,
          orders    : [],
          totalSpent: 0,
          cities    : new Set(),
          firstOrder: o.created_at,
          lastOrder : o.created_at,
        };
      }
      const c = customerMap[o.buyer_id];
      c.orders.push(o);
      c.totalSpent += o.total;
      if (o.shipping_city) c.cities.add(o.shipping_city);
      if (o.created_at < c.firstOrder) c.firstOrder = o.created_at;
      if (o.created_at > c.lastOrder)  c.lastOrder  = o.created_at;
    });

    const customers = Object.values(customerMap);
    const now30 = new Date(Date.now() - 30 * 24 * 3600 * 1000);

    // Nouveaux acheteurs dans les 30 derniers jours
    const newIn30d    = customers.filter(c => new Date(c.firstOrder) > now30).length;
    const returning   = customers.filter(c => c.orders.length > 1).length;
    const returningRate = customers.length > 0
      ? Math.round((returning / customers.length) * 1000) / 10 : 0;

    // Top 10 acheteurs
    const topCustomers = customers
      .sort((a, b) => b.totalSpent - a.totalSpent)
      .slice(0, 10)
      .map(c => ({
        buyerId     : c.buyerId,
        name        : c.name,
        ordersCount : c.orders.length,
        totalSpent  : Math.round(c.totalSpent * 100) / 100,
        avgBasket   : Math.round((c.totalSpent / c.orders.length) * 100) / 100,
        firstOrder  : c.firstOrder,
        lastOrder   : c.lastOrder,
        isReturning : c.orders.length > 1,
      }));

    // Breakdown par ville (livraison)
    const cityMap = {};
    orders.forEach(o => {
      const city = o.shipping_city || 'Inconnue';
      cityMap[city] = (cityMap[city] || 0) + 1;
    });
    const cityBreakdown = Object.entries(cityMap)
      .map(([city, count]) => ({ city, orders: count, pct: Math.round((count / orders.length) * 1000) / 10 }))
      .sort((a, b) => b.orders - a.orders)
      .slice(0, 10);

    // Cohortes mensuelles (6 derniers mois)
    const cohortMap = {};
    const today = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
      cohortMap[d.toISOString().slice(0, 7)] = { month: d.toISOString().slice(0, 7), newCustomers: 0, revenue: 0 };
    }
    customers.forEach(c => {
      const month = c.firstOrder.slice(0, 7);
      if (cohortMap[month]) {
        cohortMap[month].newCustomers++;
        cohortMap[month].revenue += c.totalSpent;
      }
    });

    res.json({
      totalUniqueCustomers: customers.length,
      newCustomers30d     : newIn30d,
      returningCustomers  : returning,
      returningRate,
      avgOrdersPerCustomer: Math.round((orders.length / customers.length) * 10) / 10,
      topCustomers,
      cityBreakdown,
      cohortData          : Object.values(cohortMap),
    });
  } catch (e) {
    console.error('[vendor-analytics-customers]', e);
    res.status(500).json({ error: e.message });
  }
});

/**
 * GET /api/vendor/analytics/reviews
 * Distribution des avis, tendance, mots fréquents.
 */
app.get('/api/vendor/analytics/reviews', verifyToken, requireRole('vendor', 'admin'), async (req, res) => {
  const vendorId = req.query.vendor_id && req.user.role === 'admin'
    ? req.query.vendor_id
    : req.user.id;

  try {
    // Produits du vendeur
    const { data: products } = await supabase
      .from('products')
      .select('id')
      .eq('vendor_id', vendorId);

    const productIds = (products || []).map(p => p.id);
    if (!productIds.length) {
      return res.json({ total: 0, avg: 0, distribution: {1:0,2:0,3:0,4:0,5:0}, recent: [], trend: [] });
    }

    const { data: reviews, error } = await supabase
      .from('reviews')
      .select('id, product_id, rating, comment, user_name, created_at, helpful')
      .in('product_id', productIds)
      .order('created_at', { ascending: false });
    if (error) throw error;

    if (!reviews?.length) {
      return res.json({ total: 0, avg: 0, distribution: {1:0,2:0,3:0,4:0,5:0}, recent: [], trend: [] });
    }

    // Distribution des notes
    const dist = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    reviews.forEach(r => dist[r.rating] = (dist[r.rating] || 0) + 1);

    const avg = Math.round((reviews.reduce((s, r) => s + r.rating, 0) / reviews.length) * 10) / 10;

    // Tendance 6 derniers mois
    const trendMap = {};
    const today = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
      trendMap[d.toISOString().slice(0, 7)] = { month: d.toISOString().slice(0, 7), count: 0, avg: 0, sum: 0 };
    }
    reviews.forEach(r => {
      const month = r.created_at.slice(0, 7);
      if (trendMap[month]) {
        trendMap[month].count++;
        trendMap[month].sum += r.rating;
        trendMap[month].avg = Math.round((trendMap[month].sum / trendMap[month].count) * 10) / 10;
      }
    });

    // Score NPS simplifié (promoteurs 5★ vs détracteurs 1-2★)
    const promotors   = dist[5];
    const detractors  = dist[1] + dist[2];
    const npsScore    = reviews.length > 0
      ? Math.round(((promotors - detractors) / reviews.length) * 100) : 0;

    res.json({
      total       : reviews.length,
      avg,
      npsScore,
      distribution: dist,
      positiveRate: Math.round(((dist[4] + dist[5]) / reviews.length) * 1000) / 10,
      recent      : reviews.slice(0, 5).map(r => ({
        id        : r.id,
        rating    : r.rating,
        comment   : r.comment,
        userName  : r.user_name,
        helpful   : r.helpful || 0,
        createdAt : r.created_at,
      })),
      trend: Object.values(trendMap),
    });
  } catch (e) {
    console.error('[vendor-analytics-reviews]', e);
    res.status(500).json({ error: e.message });
  }
});

/**
 * POST /api/vendor/analytics/view
 * Enregistre une vue de produit (appelé automatiquement par GET /api/products/:id).
 * Corps : { productId, sessionId }
 */
app.post('/api/vendor/analytics/view', async (req, res) => {
  const { productId, sessionId } = req.body;
  if (!productId) return res.status(400).json({ error: 'productId requis' });

  try {
    // Extraire le viewer_id si un token est fourni (optionnel)
    let viewerId = null;
    const auth = req.headers.authorization;
    if (auth?.startsWith('Bearer ')) {
      try {
        const payload = require('jsonwebtoken').verify(auth.slice(7), process.env.JWT_SECRET);
        viewerId = payload.id;
      } catch { /* anonyme */ }
    }

    await supabase.rpc('record_product_view', {
      p_product_id : productId,
      p_viewer_id  : viewerId,
      p_session_id : sessionId || null,
    });
    res.json({ recorded: true });
  } catch (e) {
    // Vue non critique — on ne renvoie pas d'erreur 500 pour ça
    res.json({ recorded: false, reason: e.message });
  }
});

/**
 * POST /api/vendor/analytics/refresh  (Admin seulement)
 * Force le recalcul du cache des métriques quotidiennes.
 * Corps optionnel : { date: "2024-01-15" }
 */
app.post('/api/vendor/analytics/refresh', verifyToken, requireRole('admin'), async (req, res) => {
  const date = req.body.date || null; // null = hier
  try {
    const { data, error } = await supabase.rpc('refresh_vendor_daily_metrics',
      date ? { p_date: date } : {}
    );
    if (error) throw error;
    res.json({ refreshed: true, vendorsUpdated: data, date: date || 'yesterday' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * GET /api/vendor/stats
 * Résumé rapide pour le widget "tableau de bord" du vendeur.
 * Version légère de /analytics/overview — données clés seulement.
 */
app.get('/api/vendor/stats', verifyToken, requireRole('vendor', 'admin'), async (req, res) => {
  const vendorId = req.query.vendor_id && req.user.role === 'admin'
    ? req.query.vendor_id
    : req.user.id;

  try {
    const [ordersRes, productsRes, offersRes] = await Promise.all([
      supabase.from('orders').select('id, total, commission, status, created_at')
        .eq('vendor_id', vendorId),
      supabase.from('products').select('id, stock, active, moderated')
        .eq('vendor_id', vendorId).eq('active', true),
      supabase.from('offers').select('id', { count: 'exact', head: true })
        .eq('vendor_id', vendorId).eq('status', 'pending'),
    ]);

    const orders   = ordersRes.data || [];
    const products = productsRes.data || [];

    const delivered30 = orders.filter(o =>
      o.status === 'delivered' &&
      new Date(o.created_at) > new Date(Date.now() - 30 * 24 * 3600 * 1000)
    );

    res.json({
      revenue30d     : Math.round(delivered30.reduce((s, o) => s + (o.total || 0), 0) * 100) / 100,
      orders30d      : delivered30.length,
      pendingOrders  : orders.filter(o => o.status === 'processing').length,
      activeProducts : products.filter(p => p.moderated).length,
      pendingProducts: products.filter(p => !p.moderated).length,
      lowStock       : products.filter(p => p.moderated && p.stock <= 5).length,
      pendingOffers  : offersRes.count || 0,
    });
  } catch (e) {
    console.error('[vendor-stats]', e);
    res.status(500).json({ error: e.message });
  }
});

// ─── NOTE : Ajouter aussi record_product_view dans GET /api/products/:id ─────
// Dans la route existante app.get('/api/products/:id', ...), ajouter après la
// récupération du produit :
//
//   const sessionId = req.headers['x-session-id'] || null;
//   const viewerId  = req.user?.id || null;
//   supabase.rpc('record_product_view', {
//     p_product_id : req.params.id,
//     p_viewer_id  : viewerId,
//     p_session_id : sessionId,
//   }).catch(() => {}); // Non-bloquant
//
// ─────────────────────────────────────────────────────────────────────────────
