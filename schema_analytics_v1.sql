-- ============================================================
-- NEXUS Market Sénégal — Analytics Vendeurs v1.0 (FINAL)
-- À exécuter dans Supabase SQL Editor APRÈS schema.sql
-- ============================================================

-- ─── 0. COLONNES MANQUANTES ──────────────────────────────────────────────────
ALTER TABLE profiles  ADD COLUMN IF NOT EXISTS commission_rate NUMERIC(5,2)  DEFAULT 10.0;
ALTER TABLE orders    ADD COLUMN IF NOT EXISTS commission      NUMERIC(12,2) DEFAULT 0;
ALTER TABLE orders    ADD COLUMN IF NOT EXISTS vendor_id       UUID REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE products  ADD COLUMN IF NOT EXISTS active          BOOLEAN       DEFAULT true;
ALTER TABLE products  ADD COLUMN IF NOT EXISTS moderated       BOOLEAN       DEFAULT false;
ALTER TABLE products  ADD COLUMN IF NOT EXISTS rating          NUMERIC(3,2)  DEFAULT 0;
ALTER TABLE products  ADD COLUMN IF NOT EXISTS reviews_count   INT           DEFAULT 0;

-- ─── 1. TABLE DE CACHE MÉTRIQUES QUOTIDIENNES ────────────────────────────────
CREATE TABLE IF NOT EXISTS vendor_daily_metrics (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    vendor_id   UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    date        DATE NOT NULL,
    revenue     NUMERIC(12,2) DEFAULT 0,
    net_revenue NUMERIC(12,2) DEFAULT 0,
    orders      INT DEFAULT 0,
    units_sold  INT DEFAULT 0,
    new_buyers  INT DEFAULT 0,
    avg_basket  NUMERIC(10,2) DEFAULT 0,
    UNIQUE (vendor_id, date)
);

CREATE INDEX IF NOT EXISTS idx_vdm_vendor_date
    ON vendor_daily_metrics(vendor_id, date DESC);

ALTER TABLE vendor_daily_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Vendor own metrics" ON vendor_daily_metrics
    FOR SELECT USING (vendor_id = auth.uid());

CREATE POLICY "Admin all metrics" ON vendor_daily_metrics
    FOR ALL USING (
        (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
    );

-- ─── 2. TABLE DES VUES PRODUITS ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS product_views (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id  UUID NOT NULL REFERENCES products(id)  ON DELETE CASCADE,
    vendor_id   UUID NOT NULL REFERENCES profiles(id)  ON DELETE CASCADE,
    viewer_id   UUID           REFERENCES profiles(id)  ON DELETE SET NULL,
    session_id  TEXT,
    viewed_at   TIMESTAMPTZ DEFAULT NOW(),
    -- Colonne générée IMMUTABLE : évite le cast ::DATE dans l'index
    viewed_date DATE GENERATED ALWAYS AS (
        (viewed_at AT TIME ZONE 'Africa/Dakar')::DATE
    ) STORED
);

-- Index sur la colonne stockée (pas d'expression → pas d'erreur IMMUTABLE)
CREATE INDEX IF NOT EXISTS idx_pv_product   ON product_views(product_id, viewed_at DESC);
CREATE INDEX IF NOT EXISTS idx_pv_vendor    ON product_views(vendor_id,  viewed_at DESC);
CREATE INDEX IF NOT EXISTS idx_pv_date      ON product_views(viewed_date);

ALTER TABLE product_views ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Vendor reads own views" ON product_views
    FOR SELECT USING (vendor_id = auth.uid());

CREATE POLICY "Anyone inserts view" ON product_views
    FOR INSERT WITH CHECK (true);

-- ─── 3. VUE : OVERVIEW RAPIDE PAR VENDEUR ────────────────────────────────────
CREATE OR REPLACE VIEW vendor_analytics_overview AS
SELECT
    p.id                                                                            AS vendor_id,
    p.name                                                                          AS vendor_name,
    p.commission_rate,

    COUNT(DISTINCT o.id)    FILTER (WHERE o.status = 'delivered')                  AS total_orders,
    COALESCE(SUM(o.total)   FILTER (WHERE o.status = 'delivered'), 0)              AS total_revenue,
    COALESCE(SUM(o.commission) FILTER (WHERE o.status = 'delivered'), 0)           AS total_commission,
    COALESCE(SUM(o.total - o.commission) FILTER (WHERE o.status = 'delivered'), 0) AS net_revenue,
    COALESCE(AVG(o.total)   FILTER (WHERE o.status = 'delivered'), 0)              AS avg_basket,

    COUNT(DISTINCT o.buyer_id) FILTER (WHERE o.status = 'delivered')               AS unique_buyers,
    COUNT(DISTINCT o.id)    FILTER (WHERE o.status = 'cancelled')                  AS cancelled_orders,

    CASE
        WHEN COUNT(o.id) > 0
        THEN ROUND(
            100.0 * COUNT(o.id) FILTER (WHERE o.status = 'cancelled') / COUNT(o.id),
            1
        )
        ELSE 0
    END                                                                             AS cancel_rate,

    COUNT(DISTINCT pr.id)   FILTER (WHERE pr.active AND pr.moderated)              AS active_products,
    COALESCE(AVG(r.rating), 0)                                                     AS avg_rating,
    COUNT(r.id)                                                                    AS total_reviews,

    COALESCE(SUM(o.total) FILTER (
        WHERE o.status = 'delivered'
          AND o.created_at > NOW() - INTERVAL '30 days'
    ), 0)                                                                           AS revenue_30d,
    COUNT(DISTINCT o.id)  FILTER (
        WHERE o.status = 'delivered'
          AND o.created_at > NOW() - INTERVAL '30 days'
    )                                                                               AS orders_30d,

    COALESCE(SUM(o.total) FILTER (
        WHERE o.status = 'delivered'
          AND o.created_at > NOW() - INTERVAL '7 days'
    ), 0)                                                                           AS revenue_7d,
    COUNT(DISTINCT o.id)  FILTER (
        WHERE o.status = 'delivered'
          AND o.created_at > NOW() - INTERVAL '7 days'
    )                                                                               AS orders_7d

FROM profiles p
LEFT JOIN orders   o  ON o.vendor_id  = p.id
LEFT JOIN products pr ON pr.vendor_id = p.id
LEFT JOIN reviews  r  ON r.product_id = pr.id
WHERE p.role = 'vendor'
GROUP BY p.id, p.name, p.commission_rate;

-- ─── 4. VUE : PERFORMANCE PRODUITS PAR VENDEUR ───────────────────────────────
CREATE OR REPLACE VIEW vendor_product_performance AS
SELECT
    pr.id                                                        AS product_id,
    pr.vendor_id,
    pr.name                                                      AS product_name,
    pr.category,
    pr.price,
    pr.stock,
    pr.rating,
    pr.reviews_count,
    pr.active,
    pr.moderated,
    pr.created_at,

    COALESCE(SUM(
        (SELECT SUM((item->>'quantity')::INT)
         FROM jsonb_array_elements(o.products) AS item
         WHERE (item->>'id') = pr.id::TEXT)
    ) FILTER (WHERE o.status = 'delivered'), 0)                  AS units_sold,

    COALESCE(SUM(
        (SELECT SUM((item->>'price')::NUMERIC * (item->>'quantity')::INT)
         FROM jsonb_array_elements(o.products) AS item
         WHERE (item->>'id') = pr.id::TEXT)
    ) FILTER (WHERE o.status = 'delivered'), 0)                  AS product_revenue,

    COUNT(DISTINCT o.id)  FILTER (WHERE o.status = 'delivered') AS order_count,
    COUNT(DISTINCT pv.id)                                        AS view_count,

    CASE
        WHEN COUNT(DISTINCT pv.id) > 0
        THEN ROUND(
            100.0
            * COUNT(DISTINCT o.id) FILTER (WHERE o.status = 'delivered')
            / COUNT(DISTINCT pv.id),
            2
        )
        ELSE 0
    END                                                          AS conversion_rate

FROM products pr
LEFT JOIN orders o
       ON o.vendor_id = pr.vendor_id
      AND o.products::TEXT ILIKE '%' || pr.id::TEXT || '%'
LEFT JOIN product_views pv ON pv.product_id = pr.id
GROUP BY
    pr.id, pr.vendor_id, pr.name, pr.category, pr.price,
    pr.stock, pr.rating, pr.reviews_count, pr.active, pr.moderated, pr.created_at;

-- ─── 5. FONCTION RPC : SÉRIE TEMPORELLE REVENUS ──────────────────────────────
CREATE OR REPLACE FUNCTION get_vendor_revenue_series(
    p_vendor_id UUID,
    p_days      INT DEFAULT 30
)
RETURNS TABLE (
    day         DATE,
    revenue     NUMERIC,
    net_revenue NUMERIC,
    orders      BIGINT,
    units_sold  BIGINT
)
LANGUAGE SQL STABLE AS $$
    SELECT
        d::DATE                                                                 AS day,
        COALESCE(SUM(o.total) FILTER (WHERE o.status = 'delivered'), 0)        AS revenue,
        COALESCE(
            SUM(o.total - o.commission) FILTER (WHERE o.status = 'delivered'),
            0
        )                                                                       AS net_revenue,
        COUNT(DISTINCT o.id) FILTER (WHERE o.status = 'delivered')             AS orders,
        COALESCE(SUM(
            (SELECT SUM((item->>'quantity')::INT)
             FROM jsonb_array_elements(o.products) AS item)
        ) FILTER (WHERE o.status = 'delivered'), 0)                             AS units_sold
    FROM generate_series(
        NOW()::DATE - (p_days - 1),
        NOW()::DATE,
        '1 day'::INTERVAL
    ) AS d
    LEFT JOIN orders o
           ON o.vendor_id       = p_vendor_id
          AND o.created_at::DATE = d::DATE
    GROUP BY d
    ORDER BY d ASC;
$$;

-- ─── 6. FONCTION RPC : ENREGISTRER UNE VUE PRODUIT ───────────────────────────
CREATE OR REPLACE FUNCTION record_product_view(
    p_product_id UUID,
    p_viewer_id  UUID DEFAULT NULL,
    p_session_id TEXT DEFAULT NULL
)
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE
    v_vendor_id UUID;
BEGIN
    SELECT vendor_id INTO v_vendor_id FROM products WHERE id = p_product_id;
    IF v_vendor_id IS NULL THEN RETURN; END IF;

    -- Déduplique : 1 vue par session par heure
    IF NOT EXISTS (
        SELECT 1 FROM product_views
        WHERE product_id = p_product_id
          AND (p_viewer_id  IS NULL OR viewer_id  = p_viewer_id)
          AND (p_session_id IS NULL OR session_id = p_session_id)
          AND viewed_at > NOW() - INTERVAL '1 hour'
    ) THEN
        INSERT INTO product_views(product_id, vendor_id, viewer_id, session_id)
        VALUES (p_product_id, v_vendor_id, p_viewer_id, p_session_id);
    END IF;
END;
$$;

-- ─── 7. FONCTION RPC : RAFRAÎCHIR CACHE MÉTRIQUES QUOTIDIENNES ───────────────
CREATE OR REPLACE FUNCTION refresh_vendor_daily_metrics(
    p_date DATE DEFAULT CURRENT_DATE - 1
)
RETURNS INT LANGUAGE plpgsql AS $$
DECLARE
    v_count  INT := 0;
    v_vendor RECORD;
BEGIN
    FOR v_vendor IN
        SELECT DISTINCT vendor_id FROM orders WHERE created_at::DATE = p_date
    LOOP
        INSERT INTO vendor_daily_metrics(
            vendor_id, date, revenue, net_revenue, orders, units_sold, avg_basket
        )
        SELECT
            v_vendor.vendor_id,
            p_date,
            COALESCE(SUM(total)              FILTER (WHERE status = 'delivered'), 0),
            COALESCE(SUM(total - commission) FILTER (WHERE status = 'delivered'), 0),
            COUNT(*)                          FILTER (WHERE status = 'delivered'),
            0,
            COALESCE(AVG(total)              FILTER (WHERE status = 'delivered'), 0)
        FROM orders
        WHERE vendor_id        = v_vendor.vendor_id
          AND created_at::DATE = p_date
        ON CONFLICT (vendor_id, date) DO UPDATE SET
            revenue     = EXCLUDED.revenue,
            net_revenue = EXCLUDED.net_revenue,
            orders      = EXCLUDED.orders,
            avg_basket  = EXCLUDED.avg_basket;

        v_count := v_count + 1;
    END LOOP;
    RETURN v_count;
END;
$$;

-- ─── 8. INDEX SUPPLÉMENTAIRES ─────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_orders_vendor_status_date
    ON orders(vendor_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_vendor_created
    ON orders(vendor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reviews_product_rating
    ON reviews(product_id, rating);

-- ─── 9. OPTIONNEL : pg_cron ───────────────────────────────────────────────────
-- Activer dans Supabase → Database → Extensions → pg_cron, puis :
-- SELECT cron.schedule(
--     'refresh-vendor-metrics', '0 1 * * *',
--     $$SELECT refresh_vendor_daily_metrics()$$
-- );