-- ═══════════════════════════════════════════════════════════════════
-- NEXUS Market — Migration v2.0 : Tables manquantes
-- Exécuter dans Supabase SQL Editor (après sql_fix_final v1.2)
-- ═══════════════════════════════════════════════════════════════════

-- ── MESSAGES ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS messages (
  id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  from_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  to_id       UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  from_name   TEXT,
  to_name     TEXT,
  text        TEXT NOT NULL,
  date        TIMESTAMPTZ NOT NULL DEFAULT now(),
  read        BOOLEAN NOT NULL DEFAULT false,
  deleted     BOOLEAN NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS idx_messages_from ON messages(from_id);
CREATE INDEX IF NOT EXISTS idx_messages_to   ON messages(to_id);

-- ── OFFERS ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS offers (
  id             TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  product_id     TEXT NOT NULL,
  product_name   TEXT,
  buyer_id       UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  buyer_name     TEXT,
  vendor_id      UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  offered_price  NUMERIC(12,2) NOT NULL,
  message        TEXT,
  status         TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','rejected')),
  date           TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_offers_buyer  ON offers(buyer_id);
CREATE INDEX IF NOT EXISTS idx_offers_vendor ON offers(vendor_id);

-- ── DISPUTES ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS disputes (
  id           TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  order_id     TEXT NOT NULL,
  buyer_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  buyer_name   TEXT,
  vendor_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  vendor_name  TEXT,
  reason       TEXT NOT NULL,
  description  TEXT,
  status       TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved','closed')),
  resolution   TEXT,
  admin_note   TEXT,
  date         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_disputes_buyer  ON disputes(buyer_id);
CREATE INDEX IF NOT EXISTS idx_disputes_vendor ON disputes(vendor_id);

-- ── PAYOUT REQUESTS ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payout_requests (
  id           TEXT PRIMARY KEY,
  vendor_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  vendor_name  TEXT,
  amount       NUMERIC(12,2) NOT NULL,
  method       TEXT NOT NULL CHECK (method IN ('mobile','bank')),
  provider     TEXT,
  destination  TEXT,
  status       TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','rejected')),
  date         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_payout_vendor ON payout_requests(vendor_id);

-- ── LOYALTY POINTS ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS loyalty_points (
  user_id  UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  points   INTEGER NOT NULL DEFAULT 0
);

-- ── REFERRALS ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS referrals (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id  UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  referred_id  UUID REFERENCES profiles(id) ON DELETE SET NULL,
  code         TEXT NOT NULL,
  rewarded     BOOLEAN NOT NULL DEFAULT false,
  date         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_referrals_code       ON referrals(code);
CREATE INDEX        IF NOT EXISTS idx_referrals_referrer   ON referrals(referrer_id);

-- ── WISHLISTS ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS wishlists (
  user_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  product_id  TEXT NOT NULL,
  added_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, product_id)
);
CREATE INDEX IF NOT EXISTS idx_wishlists_user ON wishlists(user_id);

-- ── STOCK ALERTS ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS stock_alerts (
  user_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  product_id  TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, product_id)
);

-- ── FLASH SALES ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS flash_sales (
  id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  product_id  TEXT NOT NULL,
  discount    INTEGER NOT NULL CHECK (discount BETWEEN 1 AND 99),
  ends_at     TIMESTAMPTZ NOT NULL,
  active      BOOLEAN NOT NULL DEFAULT true
);

-- ── COUPONS ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS coupons (
  id           TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  code         TEXT NOT NULL UNIQUE,
  discount     INTEGER NOT NULL CHECK (discount BETWEEN 1 AND 100),
  description  TEXT,
  max_uses     INTEGER,
  used_count   INTEGER NOT NULL DEFAULT 0,
  expires_at   DATE,
  active       BOOLEAN NOT NULL DEFAULT true
);

-- ── PRODUCT Q&A ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS product_qa (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id  TEXT NOT NULL,
  user_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  user_name   TEXT,
  vendor_id   UUID REFERENCES profiles(id) ON DELETE SET NULL,
  question    TEXT NOT NULL,
  answer      TEXT,
  date        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_qa_product ON product_qa(product_id);


-- ═══════════════════════════════════════════════════════════════════
-- RLS — activer + politiques
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE messages        ENABLE ROW LEVEL SECURITY;
ALTER TABLE offers          ENABLE ROW LEVEL SECURITY;
ALTER TABLE disputes        ENABLE ROW LEVEL SECURITY;
ALTER TABLE payout_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE loyalty_points  ENABLE ROW LEVEL SECURITY;
ALTER TABLE referrals       ENABLE ROW LEVEL SECURITY;
ALTER TABLE wishlists       ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_alerts    ENABLE ROW LEVEL SECURITY;
ALTER TABLE flash_sales     ENABLE ROW LEVEL SECURITY;
ALTER TABLE coupons         ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_qa      ENABLE ROW LEVEL SECURITY;

-- MESSAGES
DROP POLICY IF EXISTS "messages_select" ON messages;
DROP POLICY IF EXISTS "messages_insert" ON messages;
DROP POLICY IF EXISTS "messages_update" ON messages;
CREATE POLICY "messages_select" ON messages FOR SELECT
  USING (auth.uid() = from_id OR auth.uid() = to_id);
CREATE POLICY "messages_insert" ON messages FOR INSERT
  WITH CHECK (auth.uid() = from_id);
CREATE POLICY "messages_update" ON messages FOR UPDATE
  USING (auth.uid() = to_id OR auth.uid() = from_id);

-- OFFERS
DROP POLICY IF EXISTS "offers_select"  ON offers;
DROP POLICY IF EXISTS "offers_insert"  ON offers;
DROP POLICY IF EXISTS "offers_update"  ON offers;
CREATE POLICY "offers_select" ON offers FOR SELECT
  USING (auth.uid() = buyer_id OR auth.uid() = vendor_id);
CREATE POLICY "offers_insert" ON offers FOR INSERT
  WITH CHECK (auth.uid() = buyer_id);
CREATE POLICY "offers_update" ON offers FOR UPDATE
  USING (auth.uid() = vendor_id);

-- DISPUTES
DROP POLICY IF EXISTS "disputes_select"         ON disputes;
DROP POLICY IF EXISTS "disputes_insert"         ON disputes;
DROP POLICY IF EXISTS "disputes_admin_update"   ON disputes;
CREATE POLICY "disputes_select" ON disputes FOR SELECT
  USING (auth.uid() = buyer_id OR auth.uid() = vendor_id OR auth_user_role() = 'admin');
CREATE POLICY "disputes_insert" ON disputes FOR INSERT
  WITH CHECK (auth.uid() = buyer_id);
CREATE POLICY "disputes_admin_update" ON disputes FOR UPDATE
  USING (auth_user_role() = 'admin');

-- PAYOUT REQUESTS
DROP POLICY IF EXISTS "payout_select" ON payout_requests;
DROP POLICY IF EXISTS "payout_insert" ON payout_requests;
DROP POLICY IF EXISTS "payout_admin"  ON payout_requests;
CREATE POLICY "payout_select" ON payout_requests FOR SELECT
  USING (auth.uid() = vendor_id OR auth_user_role() = 'admin');
CREATE POLICY "payout_insert" ON payout_requests FOR INSERT
  WITH CHECK (auth.uid() = vendor_id);
CREATE POLICY "payout_admin" ON payout_requests FOR UPDATE
  USING (auth_user_role() = 'admin');

-- LOYALTY POINTS
DROP POLICY IF EXISTS "loyalty_select" ON loyalty_points;
DROP POLICY IF EXISTS "loyalty_upsert" ON loyalty_points;
DROP POLICY IF EXISTS "loyalty_admin"  ON loyalty_points;
CREATE POLICY "loyalty_select" ON loyalty_points FOR SELECT
  USING (auth.uid() = user_id);
CREATE POLICY "loyalty_upsert" ON loyalty_points FOR ALL
  WITH CHECK (true);  -- service_role only en production
CREATE POLICY "loyalty_admin" ON loyalty_points FOR ALL
  USING (auth_user_role() = 'admin');

-- REFERRALS
DROP POLICY IF EXISTS "referrals_select" ON referrals;
DROP POLICY IF EXISTS "referrals_insert" ON referrals;
CREATE POLICY "referrals_select" ON referrals FOR SELECT
  USING (auth.uid() = referrer_id OR auth.uid() = referred_id);
CREATE POLICY "referrals_insert" ON referrals FOR INSERT
  WITH CHECK (auth.uid() = referrer_id OR auth.uid() = referred_id);

-- WISHLISTS
DROP POLICY IF EXISTS "wishlists_own" ON wishlists;
CREATE POLICY "wishlists_own" ON wishlists FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- STOCK ALERTS
DROP POLICY IF EXISTS "stock_alerts_own" ON stock_alerts;
CREATE POLICY "stock_alerts_own" ON stock_alerts FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- FLASH SALES
DROP POLICY IF EXISTS "flash_public"  ON flash_sales;
DROP POLICY IF EXISTS "flash_admin"   ON flash_sales;
CREATE POLICY "flash_public" ON flash_sales FOR SELECT
  USING (active = true AND ends_at > now());
CREATE POLICY "flash_admin" ON flash_sales FOR ALL
  USING (auth_user_role() = 'admin');

-- COUPONS
DROP POLICY IF EXISTS "coupons_select" ON coupons;
DROP POLICY IF EXISTS "coupons_admin"  ON coupons;
CREATE POLICY "coupons_select" ON coupons FOR SELECT
  USING (active = true AND (expires_at IS NULL OR expires_at > CURRENT_DATE));
CREATE POLICY "coupons_admin" ON coupons FOR ALL
  USING (auth_user_role() = 'admin');

-- PRODUCT Q&A
DROP POLICY IF EXISTS "qa_public"  ON product_qa;
DROP POLICY IF EXISTS "qa_insert"  ON product_qa;
DROP POLICY IF EXISTS "qa_vendor"  ON product_qa;
CREATE POLICY "qa_public" ON product_qa FOR SELECT USING (true);
CREATE POLICY "qa_insert" ON product_qa FOR INSERT
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "qa_vendor" ON product_qa FOR UPDATE
  USING (auth.uid() = vendor_id);


-- ═══════════════════════════════════════════════════════════════════
-- GRANTS
-- ═══════════════════════════════════════════════════════════════════

GRANT SELECT, INSERT, UPDATE         ON messages        TO authenticated;
GRANT SELECT, INSERT, UPDATE         ON offers          TO authenticated;
GRANT SELECT, INSERT                 ON disputes        TO authenticated;
GRANT SELECT, INSERT                 ON payout_requests TO authenticated;
GRANT SELECT                         ON loyalty_points  TO authenticated;
GRANT SELECT, INSERT                 ON referrals       TO authenticated;
GRANT SELECT, INSERT, DELETE         ON wishlists       TO authenticated;
GRANT SELECT, INSERT, DELETE         ON stock_alerts    TO authenticated;
GRANT SELECT                         ON flash_sales     TO anon, authenticated;
GRANT SELECT                         ON coupons         TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE         ON product_qa      TO authenticated;


-- ═══════════════════════════════════════════════════════════════════
-- VÉRIFICATION
-- ═══════════════════════════════════════════════════════════════════
SELECT tablename,
       CASE rowsecurity WHEN true THEN '✅ RLS ON' ELSE '❌ OFF' END AS rls,
       COUNT(policyname) AS policies
FROM pg_tables t
LEFT JOIN pg_policies p USING (tablename)
WHERE t.schemaname = 'public'
  AND t.tablename IN (
    'messages','offers','disputes','payout_requests',
    'loyalty_points','referrals','wishlists','stock_alerts',
    'flash_sales','coupons','product_qa'
  )
GROUP BY tablename, rowsecurity
ORDER BY tablename;

-- ✅ Résultat attendu : 11 tables, toutes RLS ON, ≥2 policies chacune
