-- ============================================================
-- NEXUS Market Sénégal — Schéma PostgreSQL / Supabase v3.1
-- ============================================================
-- Exécutez ce fichier dans l'éditeur SQL de Supabase
-- (ou via psql en production)
-- ============================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm"; -- recherche full-text

-- ─── PROFILES ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS profiles (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email           TEXT UNIQUE NOT NULL,
    password_hash   TEXT NOT NULL,
    name            TEXT NOT NULL,
    avatar          TEXT,
    role            TEXT NOT NULL DEFAULT 'buyer' CHECK (role IN ('buyer', 'vendor', 'admin')),
    status          TEXT DEFAULT 'active' CHECK (status IN ('active', 'pending', 'banned', 'approved')),
    phone           TEXT,
    bio             TEXT,
    rating          NUMERIC(3,1) DEFAULT 0,
    total_sales     NUMERIC(12,2) DEFAULT 0,
    commission_rate NUMERIC(4,2) DEFAULT 15.00, -- % de commission
    shop_category   TEXT,
    last_login      TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_profiles_email  ON profiles(email);
CREATE INDEX IF NOT EXISTS idx_profiles_role   ON profiles(role);
CREATE INDEX IF NOT EXISTS idx_profiles_status ON profiles(status);

-- ─── PENDING VENDORS ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pending_vendors (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name          TEXT NOT NULL,
    owner_name    TEXT NOT NULL,
    email         TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    category      TEXT DEFAULT 'Général',
    avatar        TEXT,
    documents     TEXT[],
    status        TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    notes         TEXT,
    created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ─── PRODUCTS ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS products (
    id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name              TEXT NOT NULL,
    category          TEXT NOT NULL,
    price             NUMERIC(10,2) NOT NULL CHECK (price > 0),
    stock             INT NOT NULL DEFAULT 0 CHECK (stock >= 0),
    description       TEXT,
    image_url         TEXT,
    images            TEXT[],
    vendor_id         UUID REFERENCES profiles(id) ON DELETE CASCADE,
    vendor_name       TEXT NOT NULL,
    rating            NUMERIC(3,1) DEFAULT 0,
    reviews_count     INT DEFAULT 0,
    active            BOOLEAN DEFAULT true,
    moderated         BOOLEAN DEFAULT false,  -- Admin approval required
    moderation_reason TEXT,
    moderated_at      TIMESTAMPTZ,
    created_at        TIMESTAMPTZ DEFAULT NOW(),
    updated_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_products_name   ON products USING gin(name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_products_cat    ON products(category);
CREATE INDEX IF NOT EXISTS idx_products_vendor ON products(vendor_id);
CREATE INDEX IF NOT EXISTS idx_products_active ON products(active, moderated);

-- ─── PRODUCT QUESTIONS ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS product_questions (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id   UUID REFERENCES products(id) ON DELETE CASCADE,
    product_name TEXT NOT NULL,
    vendor_id    UUID REFERENCES profiles(id),
    user_id      UUID REFERENCES profiles(id),
    user_name    TEXT NOT NULL,
    text         TEXT NOT NULL,
    answer       TEXT,
    answered_at  TIMESTAMPTZ,
    created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_questions_product ON product_questions(product_id);
CREATE INDEX IF NOT EXISTS idx_questions_vendor  ON product_questions(vendor_id);

-- ─── ORDERS ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS orders (
    id               TEXT PRIMARY KEY DEFAULT 'ORD-' || EXTRACT(EPOCH FROM NOW())::BIGINT || '-' || UPPER(SUBSTR(MD5(RANDOM()::TEXT), 1, 5)),
    buyer_id         UUID REFERENCES profiles(id),
    buyer_name       TEXT NOT NULL,
    buyer_email      TEXT NOT NULL,
    buyer_address    TEXT,
    buyer_phone      TEXT,
    vendor_id        UUID REFERENCES profiles(id),
    vendor_name      TEXT NOT NULL,
    vendor_note      TEXT,          -- Note vendeur visible acheteur
    products         JSONB NOT NULL, -- [{id, name, price, quantity, imageUrl}]
    subtotal         NUMERIC(10,2) NOT NULL,
    discount_amount  NUMERIC(10,2) DEFAULT 0,
    total            NUMERIC(10,2) NOT NULL,
    commission       NUMERIC(10,2) NOT NULL,
    status           TEXT DEFAULT 'pending_payment'
                         CHECK (status IN ('pending_payment','processing','in_transit','delivered','cancelled')),
    payment_method   TEXT CHECK (payment_method IN ('card','mobile')),
    payment_status   TEXT DEFAULT 'pending' CHECK (payment_status IN ('pending','paid','failed','refunded')),
    stripe_payment_id TEXT,
    mobile_money_ref TEXT,          -- Référence transaction mobile money
    tracking_number  TEXT,
    shipping_city    TEXT,
    coupon_code      TEXT,
    return_status    TEXT,
    return_id        UUID,
    dispute_id       UUID,
    has_dispute      BOOLEAN DEFAULT false,
    cancel_reason    TEXT,
    cancelled_at     TIMESTAMPTZ,
    processing_at    TIMESTAMPTZ,
    in_transit_at    TIMESTAMPTZ,
    delivered_at     TIMESTAMPTZ,
    created_at       TIMESTAMPTZ DEFAULT NOW(),
    updated_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_orders_buyer   ON orders(buyer_id);
CREATE INDEX IF NOT EXISTS idx_orders_vendor  ON orders(vendor_id);
CREATE INDEX IF NOT EXISTS idx_orders_status  ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at DESC);

-- ─── RETURN REQUESTS ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS return_requests (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id     TEXT REFERENCES orders(id),
    buyer_id     UUID REFERENCES profiles(id),
    buyer_name   TEXT NOT NULL,
    vendor_id    UUID REFERENCES profiles(id),
    vendor_name  TEXT NOT NULL,
    products     JSONB,
    order_total  NUMERIC(10,2),
    category     TEXT NOT NULL,    -- 'defective', 'wrong_item', 'not_as_described', 'changed_mind', 'other'
    description  TEXT NOT NULL,
    status       TEXT DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','refunded')),
    admin_notes  TEXT,             -- Notes admin visibles par l'acheteur
    approved_at  TIMESTAMPTZ,
    rejected_at  TIMESTAMPTZ,
    refunded_at  TIMESTAMPTZ,
    created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_returns_buyer  ON return_requests(buyer_id);
CREATE INDEX IF NOT EXISTS idx_returns_vendor ON return_requests(vendor_id);
CREATE INDEX IF NOT EXISTS idx_returns_status ON return_requests(status);
CREATE INDEX IF NOT EXISTS idx_returns_order  ON return_requests(order_id);

-- ─── DISPUTES ───────────────────────────────────────────────────────────────
-- Table manquante dans la version originale — nécessaire pour le système de litiges
CREATE TABLE IF NOT EXISTS disputes (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id        TEXT REFERENCES orders(id),
    buyer_id        UUID REFERENCES profiles(id),
    buyer_name      TEXT NOT NULL,
    vendor_id       UUID REFERENCES profiles(id),
    vendor_name     TEXT NOT NULL,
    order_total     NUMERIC(10,2),
    reason          TEXT NOT NULL,  -- 'not_received', 'not_as_described', 'damaged', 'unauthorized', 'other'
    description     TEXT NOT NULL,
    status          TEXT DEFAULT 'open' CHECK (status IN ('open','investigating','resolved','closed')),
    resolution      TEXT,           -- Description de la résolution (visible par les deux parties)
    admin_notes     TEXT,           -- Notes internes admin uniquement
    resolved_by     UUID REFERENCES profiles(id),
    open_at         TIMESTAMPTZ DEFAULT NOW(),
    investigating_at TIMESTAMPTZ,
    resolved_at     TIMESTAMPTZ,
    closed_at       TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_disputes_buyer  ON disputes(buyer_id);
CREATE INDEX IF NOT EXISTS idx_disputes_vendor ON disputes(vendor_id);
CREATE INDEX IF NOT EXISTS idx_disputes_order  ON disputes(order_id);
CREATE INDEX IF NOT EXISTS idx_disputes_status ON disputes(status);

-- ─── REVIEWS ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS reviews (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id  UUID REFERENCES products(id) ON DELETE CASCADE,
    user_id     UUID REFERENCES profiles(id),
    user_name   TEXT NOT NULL,
    rating      INT NOT NULL CHECK (rating BETWEEN 1 AND 5),
    comment     TEXT,
    helpful     INT DEFAULT 0,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(product_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_reviews_product ON reviews(product_id);

-- ─── MESSAGES ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS messages (
    id        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    from_id   UUID REFERENCES profiles(id),
    from_name TEXT NOT NULL,
    to_id     UUID REFERENCES profiles(id),
    to_name   TEXT NOT NULL,
    text      TEXT NOT NULL,
    read      BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messages_to   ON messages(to_id);
CREATE INDEX IF NOT EXISTS idx_messages_from ON messages(from_id);
CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(from_id, to_id, created_at DESC);

-- ─── NOTIFICATIONS ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
    id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id    UUID REFERENCES profiles(id) ON DELETE CASCADE,
    type       TEXT NOT NULL CHECK (type IN ('order','offer','message','return','vendor','system','dispute')),
    title      TEXT NOT NULL,
    message    TEXT NOT NULL,
    read       BOOLEAN DEFAULT false,
    link       TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifs_user    ON notifications(user_id, read);
CREATE INDEX IF NOT EXISTS idx_notifs_created ON notifications(created_at DESC);

-- ─── COUPONS ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS coupons (
    id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code             TEXT UNIQUE NOT NULL,
    discount_percent NUMERIC(5,2) NOT NULL CHECK (discount_percent > 0 AND discount_percent <= 100),
    type             TEXT DEFAULT 'percent' CHECK (type IN ('percent','fixed')),
    description      TEXT,
    min_order_amount NUMERIC(10,2) DEFAULT 0,
    max_uses         INT,
    used_count       INT DEFAULT 0,
    active           BOOLEAN DEFAULT true,
    expires_at       TIMESTAMPTZ,
    created_by       UUID REFERENCES profiles(id),
    created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- ─── OFFERS (négociation de prix) ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS offers (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id    UUID REFERENCES products(id),
    product_name  TEXT NOT NULL,
    buyer_id      UUID REFERENCES profiles(id),
    buyer_name    TEXT NOT NULL,
    vendor_id     UUID REFERENCES profiles(id),
    offered_price NUMERIC(10,2) NOT NULL,
    counter_price NUMERIC(10,2),   -- Contre-proposition du vendeur
    message       TEXT,
    status        TEXT DEFAULT 'pending' CHECK (status IN ('pending','accepted','rejected')),
    created_at    TIMESTAMPTZ DEFAULT NOW(),
    updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_offers_buyer  ON offers(buyer_id);
CREATE INDEX IF NOT EXISTS idx_offers_vendor ON offers(vendor_id);
CREATE INDEX IF NOT EXISTS idx_offers_status ON offers(status);

-- ─── WISHLISTS ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS wishlists (
    user_id    UUID REFERENCES profiles(id) ON DELETE CASCADE,
    product_id UUID REFERENCES products(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (user_id, product_id)
);

-- ─── PASSWORD RESETS ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS password_resets (
    email      TEXT PRIMARY KEY,
    code       TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── STOCK ALERTS ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS stock_alerts (
    product_id  UUID REFERENCES products(id) ON DELETE CASCADE,
    user_id     UUID REFERENCES profiles(id) ON DELETE CASCADE,
    user_email  TEXT,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (product_id, user_id)
);

-- ─── FLASH SALES ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS flash_sales (
    id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id       UUID REFERENCES products(id) ON DELETE CASCADE,
    discount_percent NUMERIC(5,2) NOT NULL,
    ends_at          TIMESTAMPTZ NOT NULL,
    active           BOOLEAN DEFAULT true,
    created_by       UUID REFERENCES profiles(id),
    created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- ─── PAYOUT REQUESTS ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payout_requests (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    vendor_id     UUID REFERENCES profiles(id),
    vendor_name   TEXT NOT NULL,
    amount        NUMERIC(12,2) NOT NULL,
    method        TEXT CHECK (method IN ('mobile','bank')),
    provider      TEXT,            -- 'orange', 'wave', 'free', 'bank_name'
    destination   TEXT NOT NULL,   -- Numéro tel ou IBAN
    status        TEXT DEFAULT 'pending' CHECK (status IN ('pending','paid','rejected')),
    admin_note    TEXT,
    processed_at  TIMESTAMPTZ,
    processed_by  UUID REFERENCES profiles(id),
    created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payouts_vendor ON payout_requests(vendor_id);
CREATE INDEX IF NOT EXISTS idx_payouts_status ON payout_requests(status);

-- ─── RLS ACTIVATION ─────────────────────────────────────────────────────────
ALTER TABLE profiles          ENABLE ROW LEVEL SECURITY;
ALTER TABLE products          ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders            ENABLE ROW LEVEL SECURITY;
ALTER TABLE reviews           ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages          ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications     ENABLE ROW LEVEL SECURITY;
ALTER TABLE wishlists         ENABLE ROW LEVEL SECURITY;
ALTER TABLE offers            ENABLE ROW LEVEL SECURITY;
ALTER TABLE return_requests   ENABLE ROW LEVEL SECURITY;
ALTER TABLE disputes          ENABLE ROW LEVEL SECURITY;
ALTER TABLE coupons           ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_alerts      ENABLE ROW LEVEL SECURITY;
ALTER TABLE flash_sales       ENABLE ROW LEVEL SECURITY;
ALTER TABLE payout_requests   ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_questions ENABLE ROW LEVEL SECURITY;

-- ─── ROW LEVEL SECURITY POLICIES ────────────────────────────────────────────

-- Produits
DROP POLICY IF EXISTS "products_public_read" ON products;
CREATE POLICY "products_public_read" ON products FOR SELECT USING (active = true AND moderated = true);
DROP POLICY IF EXISTS "vendors_manage_own" ON products;
CREATE POLICY "vendors_manage_own" ON products FOR ALL   USING (vendor_id = auth.uid());
DROP POLICY IF EXISTS "admin_all_products" ON products;
CREATE POLICY "admin_all_products" ON products FOR ALL   USING ((SELECT role FROM profiles WHERE id = auth.uid()) = 'admin');

-- Profils
DROP POLICY IF EXISTS "profiles_public_read" ON profiles;
CREATE POLICY "profiles_public_read" ON profiles FOR SELECT USING (true);
DROP POLICY IF EXISTS "users_update_own" ON profiles;
CREATE POLICY "users_update_own" ON profiles FOR UPDATE USING (id = auth.uid());
DROP POLICY IF EXISTS "admin_all_profiles" ON profiles;
CREATE POLICY "admin_all_profiles" ON profiles FOR ALL   USING ((SELECT role FROM profiles WHERE id = auth.uid()) = 'admin');

-- Commandes
DROP POLICY IF EXISTS "buyer_sees_own_orders" ON orders;
CREATE POLICY "buyer_sees_own_orders" ON orders FOR SELECT USING (buyer_id = auth.uid());
DROP POLICY IF EXISTS "vendor_sees_own_orders" ON orders;
CREATE POLICY "vendor_sees_own_orders" ON orders FOR SELECT USING (vendor_id = auth.uid());
DROP POLICY IF EXISTS "admin_all_orders" ON orders;
CREATE POLICY "admin_all_orders" ON orders FOR ALL   USING ((SELECT role FROM profiles WHERE id = auth.uid()) = 'admin');

-- Notifications
DROP POLICY IF EXISTS "own_notifications" ON notifications;
CREATE POLICY "own_notifications" ON notifications FOR ALL USING (user_id = auth.uid());

-- Messages
DROP POLICY IF EXISTS "message_participants" ON messages;
CREATE POLICY "message_participants" ON messages FOR SELECT USING (from_id = auth.uid() OR to_id = auth.uid());
DROP POLICY IF EXISTS "send_messages" ON messages;
CREATE POLICY "send_messages" ON messages FOR INSERT WITH CHECK (from_id = auth.uid());
DROP POLICY IF EXISTS "mark_read" ON messages;
CREATE POLICY "mark_read" ON messages FOR UPDATE USING (to_id = auth.uid());

-- Wishlist
DROP POLICY IF EXISTS "own_wishlist" ON wishlists;
CREATE POLICY "own_wishlist" ON wishlists FOR ALL USING (user_id = auth.uid());

-- Offres
DROP POLICY IF EXISTS "buyer_sees_own_offers" ON offers;
CREATE POLICY "buyer_sees_own_offers" ON offers FOR SELECT USING (buyer_id = auth.uid());
DROP POLICY IF EXISTS "vendor_sees_own_offers" ON offers;
CREATE POLICY "vendor_sees_own_offers" ON offers FOR SELECT USING (vendor_id = auth.uid());
DROP POLICY IF EXISTS "buyer_creates_offers" ON offers;
CREATE POLICY "buyer_creates_offers" ON offers FOR INSERT WITH CHECK (buyer_id = auth.uid());
DROP POLICY IF EXISTS "vendor_updates_offers" ON offers;
CREATE POLICY "vendor_updates_offers" ON offers FOR UPDATE USING (vendor_id = auth.uid());

-- Coupons
DROP POLICY IF EXISTS "coupons_auth_read" ON coupons;
CREATE POLICY "coupons_auth_read" ON coupons FOR SELECT USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "admin_manages_coupons" ON coupons;
CREATE POLICY "admin_manages_coupons" ON coupons FOR ALL   USING ((SELECT role FROM profiles WHERE id = auth.uid()) = 'admin');

-- Retours
DROP POLICY IF EXISTS "buyer_sees_own_returns" ON return_requests;
CREATE POLICY "buyer_sees_own_returns" ON return_requests FOR SELECT USING (buyer_id = auth.uid());
DROP POLICY IF EXISTS "vendor_sees_returns" ON return_requests;
CREATE POLICY "vendor_sees_returns" ON return_requests FOR SELECT USING (vendor_id = auth.uid());
DROP POLICY IF EXISTS "buyer_creates_returns" ON return_requests;
CREATE POLICY "buyer_creates_returns" ON return_requests FOR INSERT WITH CHECK (buyer_id = auth.uid());
DROP POLICY IF EXISTS "admin_all_returns" ON return_requests;
CREATE POLICY "admin_all_returns" ON return_requests FOR ALL   USING ((SELECT role FROM profiles WHERE id = auth.uid()) = 'admin');

-- Litiges
DROP POLICY IF EXISTS "buyer_sees_own_disputes" ON disputes;
CREATE POLICY "buyer_sees_own_disputes" ON disputes FOR SELECT USING (buyer_id = auth.uid());
DROP POLICY IF EXISTS "vendor_sees_disputes" ON disputes;
CREATE POLICY "vendor_sees_disputes" ON disputes FOR SELECT USING (vendor_id = auth.uid());
DROP POLICY IF EXISTS "buyer_creates_disputes" ON disputes;
CREATE POLICY "buyer_creates_disputes" ON disputes FOR INSERT WITH CHECK (buyer_id = auth.uid());
DROP POLICY IF EXISTS "admin_all_disputes" ON disputes;
CREATE POLICY "admin_all_disputes" ON disputes FOR ALL   USING ((SELECT role FROM profiles WHERE id = auth.uid()) = 'admin');

-- Stock alerts
DROP POLICY IF EXISTS "own_stock_alerts" ON stock_alerts;
CREATE POLICY "own_stock_alerts" ON stock_alerts     FOR ALL USING (user_id = auth.uid());

-- Flash sales
DROP POLICY IF EXISTS "public_flash_sales" ON flash_sales;
CREATE POLICY "public_flash_sales" ON flash_sales      FOR SELECT USING (active = true AND ends_at > NOW());
DROP POLICY IF EXISTS "admin_flash_sales" ON flash_sales;
CREATE POLICY "admin_flash_sales" ON flash_sales      FOR ALL   USING ((SELECT role FROM profiles WHERE id = auth.uid()) = 'admin');

-- Payout requests
DROP POLICY IF EXISTS "vendor_payout_requests" ON payout_requests;
CREATE POLICY "vendor_payout_requests" ON payout_requests  FOR SELECT USING (vendor_id = auth.uid());
DROP POLICY IF EXISTS "vendor_create_payouts" ON payout_requests;
CREATE POLICY "vendor_create_payouts" ON payout_requests  FOR INSERT WITH CHECK (vendor_id = auth.uid());
DROP POLICY IF EXISTS "admin_payout_requests" ON payout_requests;
CREATE POLICY "admin_payout_requests" ON payout_requests  FOR ALL   USING ((SELECT role FROM profiles WHERE id = auth.uid()) = 'admin');

-- Questions produits
DROP POLICY IF EXISTS "questions_public_read" ON product_questions;
CREATE POLICY "questions_public_read" ON product_questions FOR SELECT USING (true);
DROP POLICY IF EXISTS "users_ask_questions" ON product_questions;
CREATE POLICY "users_ask_questions" ON product_questions FOR INSERT WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "vendor_answers" ON product_questions;
CREATE POLICY "vendor_answers" ON product_questions FOR UPDATE USING (vendor_id = auth.uid());

-- ─── RPC FUNCTIONS ──────────────────────────────────────────────────────────

-- Décrémenter le stock de façon atomique
CREATE OR REPLACE FUNCTION decrement_stock(product_id UUID, qty INT)
RETURNS VOID AS $$
  UPDATE products SET stock = GREATEST(0, stock - qty), updated_at = NOW()
  WHERE id = product_id;
$$ LANGUAGE SQL;

-- Incrémenter le stock (annulation)
CREATE OR REPLACE FUNCTION increment_stock(product_id UUID, qty INT)
RETURNS VOID AS $$
  UPDATE products SET stock = stock + qty, updated_at = NOW()
  WHERE id = product_id;
$$ LANGUAGE SQL;

-- updated_at automatique
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_profiles_updated ON profiles;
CREATE TRIGGER trg_profiles_updated  BEFORE UPDATE ON profiles  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS trg_products_updated ON products;
CREATE TRIGGER trg_products_updated  BEFORE UPDATE ON products  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS trg_orders_updated ON orders;
CREATE TRIGGER trg_orders_updated    BEFORE UPDATE ON orders    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS trg_offers_updated ON offers;
CREATE TRIGGER trg_offers_updated    BEFORE UPDATE ON offers    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── RÉALTIME ───────────────────────────────────────────────────────────────
-- Activer dans Supabase Dashboard → Table Editor → [table] → Enable Realtime
-- Tables recommandées pour le Realtime : notifications, messages, orders

-- ─── VUES UTILES ────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW vendor_stats AS
SELECT
  p.id AS vendor_id,
  p.name AS vendor_name,
  p.avatar,
  p.shop_category,
  p.rating AS profile_rating,
  COUNT(DISTINCT o.id) AS total_orders,
  COALESCE(SUM(o.total), 0) AS total_revenue,
  COALESCE(SUM(o.commission), 0) AS total_commission,
  COALESCE(SUM(o.total - o.commission), 0) AS net_payout,
  COUNT(DISTINCT pr.id) AS total_products,
  COALESCE(AVG(r.rating), 0) AS avg_rating,
  COUNT(DISTINCT r.id) AS total_reviews
FROM profiles p
LEFT JOIN orders o ON o.vendor_id = p.id AND o.status = 'delivered'
LEFT JOIN products pr ON pr.vendor_id = p.id AND pr.active = true
LEFT JOIN reviews r ON r.product_id = pr.id
WHERE p.role = 'vendor' AND p.status = 'approved'
GROUP BY p.id, p.name, p.avatar, p.shop_category, p.rating;

CREATE OR REPLACE VIEW platform_stats AS
SELECT
  COUNT(DISTINCT CASE WHEN role = 'buyer'  THEN id END) AS total_buyers,
  COUNT(DISTINCT CASE WHEN role = 'vendor' THEN id END) AS total_vendors,
  (SELECT COUNT(*) FROM products WHERE active = true AND moderated = true) AS total_products,
  (SELECT COUNT(*) FROM products WHERE moderated = false AND active = true) AS pending_products,
  (SELECT COUNT(*) FROM orders) AS total_orders,
  (SELECT COUNT(*) FROM orders WHERE status = 'delivered') AS delivered_orders,
  (SELECT COUNT(*) FROM orders WHERE status = 'processing') AS processing_orders,
  (SELECT COALESCE(SUM(total), 0) FROM orders WHERE status = 'delivered') AS total_revenue,
  (SELECT COALESCE(SUM(commission), 0) FROM orders WHERE status = 'delivered') AS total_commission,
  (SELECT COUNT(*) FROM disputes WHERE status = 'open') AS open_disputes,
  (SELECT COUNT(*) FROM return_requests WHERE status = 'pending') AS pending_returns,
  (SELECT COUNT(*) FROM pending_vendors WHERE status = 'pending') AS pending_vendors
FROM profiles;

-- ─── DONNÉES DE DÉMONSTRATION ───────────────────────────────────────────────
-- Coupons par défaut
INSERT INTO coupons (code, discount_percent, type, description, max_uses, active)
VALUES
  ('BIENVENUE10', 10, 'percent', '10% de réduction sur votre première commande', 1000, true),
  ('SENEGAL',      5, 'percent', '5% pour les fêtes nationales', NULL, true),
  ('NEXUS20',     20, 'percent', '20% — offre de lancement', 500, true)
ON CONFLICT (code) DO NOTHING;

-- Admin par défaut — CHANGER LE MOT DE PASSE EN PRODUCTION !
-- Le hash ci-dessous correspond à 'admin123' (bcrypt, 12 rounds)
-- Générez votre propre hash avec : node -e "require('bcrypt').hash('votre_mdp', 12).then(console.log)"
-- INSERT INTO profiles (email, password_hash, name, role, status, avatar)
-- VALUES ('admin@nexus.sn', '$2b$12$VOTRE_HASH_ICI', 'Admin NEXUS', 'admin', 'active', 'AD')
-- ON CONFLICT (email) DO NOTHING;

-- ─── NOTES DE DÉPLOIEMENT ───────────────────────────────────────────────────
-- 1. Activez le Realtime sur les tables : notifications, messages, orders
--    (Supabase Dashboard → Database → Replication → Source tables)
--
-- 2. Configurez les webhooks pour le Mobile Money dans le backend :
--    POST /webhooks/mobile-money  (Orange Money / Wave)
--    POST /webhooks/stripe        (Stripe)
--
-- 3. Créez les index de recherche full-text sur description :
--    CREATE INDEX idx_products_desc ON products USING gin(description gin_trgm_ops);
--
-- 4. Configurez les alertes de monitoring Supabase pour :
--    - stock = 0 (alerte stock épuisé)
--    - disputes status = 'open' > 24h (alerte litiges non traités)
