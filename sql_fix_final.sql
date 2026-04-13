-- ═══════════════════════════════════════════════════════════════════
-- NEXUS Market — SQL Fix Final Consolidé v1.0
-- UN SEUL FICHIER à exécuter dans Supabase SQL Editor
-- Remplace : rls_final.sql + fix_rls_profiles.sql + permissions_nexus.sql
-- ═══════════════════════════════════════════════════════════════════
-- ⚠️  IMPORTANT : Exécuter en UNE SEULE FOIS (tout sélectionner → Run)
-- ⚠️  Ignore les erreurs "already exists" — les DROP IF EXISTS les gèrent
-- ═══════════════════════════════════════════════════════════════════


-- ════════════════════════════════════════════════════════════════════
-- ÉTAPE 1 — Nettoyer TOUTES les anciennes policies en conflit
-- (5 fichiers SQL avaient créé des policies contradictoires)
-- ════════════════════════════════════════════════════════════════════

-- Profiles — toutes les variantes existantes
DROP POLICY IF EXISTS "profiles_public_read"         ON profiles;
DROP POLICY IF EXISTS "profiles_vendor_public"        ON profiles;
DROP POLICY IF EXISTS "profiles_select_public"        ON profiles;
DROP POLICY IF EXISTS "users_update_own"              ON profiles;
DROP POLICY IF EXISTS "profiles_update_own"           ON profiles;
DROP POLICY IF EXISTS "admin_all_profiles"            ON profiles;
DROP POLICY IF EXISTS "profiles_insert_trigger"       ON profiles;
DROP POLICY IF EXISTS "Users can view own profile"    ON profiles;
DROP POLICY IF EXISTS "Users can insert own profile"  ON profiles;
DROP POLICY IF EXISTS "Users can update own profile"  ON profiles;
DROP POLICY IF EXISTS "Users can upsert own profile"  ON profiles;

-- Products
DROP POLICY IF EXISTS "products_public_read"     ON products;
DROP POLICY IF EXISTS "products_select_active"   ON products;
DROP POLICY IF EXISTS "products_select_own"      ON products;
DROP POLICY IF EXISTS "vendors_manage_own"       ON products;
DROP POLICY IF EXISTS "vendor_insert_own"        ON products;
DROP POLICY IF EXISTS "vendor_update_own"        ON products;
DROP POLICY IF EXISTS "vendor_delete_own"        ON products;
DROP POLICY IF EXISTS "products_insert_vendor"   ON products;
DROP POLICY IF EXISTS "products_update_vendor"   ON products;
DROP POLICY IF EXISTS "products_delete_vendor"   ON products;
DROP POLICY IF EXISTS "admin_all_products"       ON products;

-- Orders
DROP POLICY IF EXISTS "buyer_sees_own_orders"        ON orders;
DROP POLICY IF EXISTS "buyer_creates_order"          ON orders;
DROP POLICY IF EXISTS "vendor_sees_own_orders"       ON orders;
DROP POLICY IF EXISTS "vendor_updates_order_status"  ON orders;
DROP POLICY IF EXISTS "orders_select_buyer"          ON orders;
DROP POLICY IF EXISTS "orders_select_vendor"         ON orders;
DROP POLICY IF EXISTS "orders_insert_buyer"          ON orders;
DROP POLICY IF EXISTS "orders_update_vendor"         ON orders;
DROP POLICY IF EXISTS "admin_all_orders"             ON orders;

-- Messages
DROP POLICY IF EXISTS "message_participants"   ON messages;
DROP POLICY IF EXISTS "send_messages"          ON messages;
DROP POLICY IF EXISTS "mark_read"              ON messages;
DROP POLICY IF EXISTS "mark_read_or_delete"    ON messages;
DROP POLICY IF EXISTS "messages_select"        ON messages;
DROP POLICY IF EXISTS "messages_insert"        ON messages;
DROP POLICY IF EXISTS "messages_update"        ON messages;

-- Notifications
DROP POLICY IF EXISTS "own_notifications"             ON notifications;
DROP POLICY IF EXISTS "own_notifications_read"        ON notifications;
DROP POLICY IF EXISTS "own_notifications_update"      ON notifications;
DROP POLICY IF EXISTS "system_creates_notifications"  ON notifications;
DROP POLICY IF EXISTS "notifs_select_own"             ON notifications;
DROP POLICY IF EXISTS "notifs_update_own"             ON notifications;
DROP POLICY IF EXISTS "notifs_insert_backend"         ON notifications;

-- Reviews
DROP POLICY IF EXISTS "reviews_public_read"    ON reviews;
DROP POLICY IF EXISTS "reviews_select_public"  ON reviews;
DROP POLICY IF EXISTS "buyers_create_reviews"  ON reviews;
DROP POLICY IF EXISTS "reviews_insert_buyer"   ON reviews;
DROP POLICY IF EXISTS "own_review_update"      ON reviews;
DROP POLICY IF EXISTS "reviews_update_own"     ON reviews;
DROP POLICY IF EXISTS "reviews_delete_own"     ON reviews;
DROP POLICY IF EXISTS "admin_all_reviews"      ON reviews;

-- Offers
DROP POLICY IF EXISTS "buyer_sees_own_offers"   ON offers;
DROP POLICY IF EXISTS "vendor_sees_own_offers"  ON offers;
DROP POLICY IF EXISTS "buyer_creates_offers"    ON offers;
DROP POLICY IF EXISTS "vendor_updates_offers"   ON offers;

-- Wishlists
DROP POLICY IF EXISTS "own_wishlist" ON wishlists;

-- Coupons
DROP POLICY IF EXISTS "coupons_auth_read"      ON coupons;
DROP POLICY IF EXISTS "admin_manages_coupons"  ON coupons;
DROP POLICY IF EXISTS "coupons_select_active"  ON coupons;

-- Returns
DROP POLICY IF EXISTS "buyer_sees_own_returns"  ON return_requests;
DROP POLICY IF EXISTS "vendor_sees_returns"     ON return_requests;
DROP POLICY IF EXISTS "buyer_creates_returns"   ON return_requests;
DROP POLICY IF EXISTS "admin_all_returns"       ON return_requests;

-- Disputes
DROP POLICY IF EXISTS "buyer_sees_own_disputes"  ON disputes;
DROP POLICY IF EXISTS "vendor_sees_disputes"     ON disputes;
DROP POLICY IF EXISTS "buyer_creates_disputes"   ON disputes;
DROP POLICY IF EXISTS "admin_all_disputes"       ON disputes;

-- Stock alerts
DROP POLICY IF EXISTS "own_stock_alerts" ON stock_alerts;

-- Flash sales
DROP POLICY IF EXISTS "public_flash_sales"  ON flash_sales;
DROP POLICY IF EXISTS "admin_flash_sales"   ON flash_sales;

-- Payout requests
DROP POLICY IF EXISTS "vendor_payout_requests"  ON payout_requests;
DROP POLICY IF EXISTS "vendor_create_payouts"   ON payout_requests;
DROP POLICY IF EXISTS "admin_payout_requests"   ON payout_requests;

-- Pending vendors
DROP POLICY IF EXISTS "admin_all_pending_vendors"      ON pending_vendors;
DROP POLICY IF EXISTS "public_insert_pending_vendor"   ON pending_vendors;

-- Product questions
DROP POLICY IF EXISTS "questions_public_read"     ON product_questions;
DROP POLICY IF EXISTS "auth_create_questions"     ON product_questions;
DROP POLICY IF EXISTS "users_ask_questions"       ON product_questions;
DROP POLICY IF EXISTS "vendor_answers_question"   ON product_questions;
DROP POLICY IF EXISTS "vendor_answers"            ON product_questions;
DROP POLICY IF EXISTS "admin_all_questions"       ON product_questions;

-- Analytics
DROP POLICY IF EXISTS "vdm_vendor_own"       ON vendor_daily_metrics;
DROP POLICY IF EXISTS "vdm_admin_all"        ON vendor_daily_metrics;
DROP POLICY IF EXISTS "pv_vendor_reads"      ON product_views;
DROP POLICY IF EXISTS "pv_anyone_inserts"    ON product_views;
DROP POLICY IF EXISTS "Vendor own metrics"   ON vendor_daily_metrics;
DROP POLICY IF EXISTS "Admin all metrics"    ON vendor_daily_metrics;
DROP POLICY IF EXISTS "Vendor reads own views" ON product_views;
DROP POLICY IF EXISTS "Anyone inserts view"    ON product_views;

-- Order items
DROP POLICY IF EXISTS "order_items_select"  ON order_items;
DROP POLICY IF EXISTS "order_items_insert"  ON order_items;


-- ════════════════════════════════════════════════════════════════════
-- ÉTAPE 2 — Activer RLS sur toutes les tables
-- ════════════════════════════════════════════════════════════════════

ALTER TABLE profiles           ENABLE ROW LEVEL SECURITY;
ALTER TABLE products           ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders             ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages           ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications      ENABLE ROW LEVEL SECURITY;
ALTER TABLE reviews            ENABLE ROW LEVEL SECURITY;
ALTER TABLE offers             ENABLE ROW LEVEL SECURITY;
ALTER TABLE wishlists          ENABLE ROW LEVEL SECURITY;
ALTER TABLE return_requests    ENABLE ROW LEVEL SECURITY;
ALTER TABLE disputes           ENABLE ROW LEVEL SECURITY;
ALTER TABLE coupons            ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_alerts       ENABLE ROW LEVEL SECURITY;
ALTER TABLE flash_sales        ENABLE ROW LEVEL SECURITY;
ALTER TABLE payout_requests    ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_questions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE pending_vendors    ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'order_items')       THEN ALTER TABLE order_items ENABLE ROW LEVEL SECURITY; END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'vendor_daily_metrics') THEN ALTER TABLE vendor_daily_metrics ENABLE ROW LEVEL SECURITY; END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'product_views')     THEN ALTER TABLE product_views ENABLE ROW LEVEL SECURITY; END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'refresh_tokens')    THEN ALTER TABLE refresh_tokens ENABLE ROW LEVEL SECURITY; END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'loyalty_points')    THEN ALTER TABLE loyalty_points ENABLE ROW LEVEL SECURITY; END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'review_votes')      THEN ALTER TABLE review_votes ENABLE ROW LEVEL SECURITY; END IF;
END $$;


-- ════════════════════════════════════════════════════════════════════
-- ÉTAPE 3 — Fonction helper rôle (évite les sous-requêtes répétitives)
-- ════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION auth_user_role()
RETURNS TEXT LANGUAGE SQL STABLE SECURITY DEFINER AS $$
  SELECT role FROM profiles WHERE id = auth.uid()
$$;


-- ════════════════════════════════════════════════════════════════════
-- ÉTAPE 4 — Permissions GRANT (rôles anon / authenticated)
-- ════════════════════════════════════════════════════════════════════

-- profiles
GRANT SELECT          ON public.profiles TO anon;
GRANT SELECT, UPDATE  ON public.profiles TO authenticated;

-- products
GRANT SELECT                    ON public.products TO anon;
GRANT SELECT, INSERT, UPDATE    ON public.products TO authenticated;

-- orders
GRANT SELECT, INSERT, UPDATE    ON public.orders TO authenticated;

-- order_items (si existe)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'order_items') THEN
    EXECUTE 'GRANT SELECT, INSERT ON public.order_items TO authenticated';
  END IF;
END $$;

-- messages
GRANT SELECT, INSERT, UPDATE ON public.messages TO authenticated;

-- reviews
GRANT SELECT                           ON public.reviews TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE   ON public.reviews TO authenticated;

-- [FIX 3] notifications — INSERT ajouté (manquait dans permissions_nexus.sql)
GRANT SELECT, INSERT, UPDATE ON public.notifications TO authenticated;

-- coupons
GRANT SELECT ON public.coupons TO anon, authenticated;

-- wishlists
GRANT SELECT, INSERT, DELETE ON public.wishlists TO authenticated;

-- offers
GRANT SELECT, INSERT, UPDATE ON public.offers TO authenticated;

-- return_requests
GRANT SELECT, INSERT ON public.return_requests TO authenticated;

-- disputes
GRANT SELECT, INSERT ON public.disputes TO authenticated;

-- stock_alerts
GRANT SELECT, INSERT, DELETE ON public.stock_alerts TO authenticated;

-- flash_sales
GRANT SELECT ON public.flash_sales TO anon, authenticated;

-- payout_requests
GRANT SELECT, INSERT ON public.payout_requests TO authenticated;

-- product_questions
GRANT SELECT ON public.product_questions TO anon;
GRANT SELECT, INSERT, UPDATE ON public.product_questions TO authenticated;

-- pending_vendors : insertion publique (inscription sans compte)
GRANT SELECT, INSERT ON public.pending_vendors TO anon;
GRANT SELECT ON public.pending_vendors TO authenticated;

-- analytics
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'vendor_daily_metrics') THEN
    EXECUTE 'GRANT SELECT ON public.vendor_daily_metrics TO authenticated';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'product_views') THEN
    EXECUTE 'GRANT SELECT ON public.product_views TO authenticated';
    EXECUTE 'GRANT INSERT ON public.product_views TO anon, authenticated';
  END IF;
END $$;


-- ════════════════════════════════════════════════════════════════════
-- ÉTAPE 5 — Politiques RLS définitives (une seule version par table)
-- ════════════════════════════════════════════════════════════════════

-- ── PROFILES ─────────────────────────────────────────────────────────
-- Lecture : tout le monde (nom, avatar nécessaires pour affichage produits)
CREATE POLICY "profiles_select_public" ON profiles
  FOR SELECT USING (true);

-- Modification : seulement son propre profil
CREATE POLICY "profiles_update_own" ON profiles
  FOR UPDATE USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Insertion : via trigger handle_new_user (service_role) ou via backend
CREATE POLICY "profiles_insert_own" ON profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

-- Admin : accès complet
CREATE POLICY "admin_all_profiles" ON profiles
  FOR ALL USING (auth_user_role() = 'admin');


-- ── PRODUCTS ──────────────────────────────────────────────────────────
-- Visiteurs : produits actifs et modérés
CREATE POLICY "products_select_active" ON products
  FOR SELECT USING (active = true AND moderated = true);

-- Vendeur : voir aussi ses propres produits non modérés
CREATE POLICY "products_select_own" ON products
  FOR SELECT USING (auth.uid() = vendor_id);

-- Vendeur : créer un produit lié à soi
CREATE POLICY "products_insert_vendor" ON products
  FOR INSERT WITH CHECK (auth.uid() = vendor_id);

-- Vendeur : modifier uniquement ses propres produits
CREATE POLICY "products_update_vendor" ON products
  FOR UPDATE USING (auth.uid() = vendor_id)
  WITH CHECK (auth.uid() = vendor_id);

-- Vendeur : supprimer ses propres produits
CREATE POLICY "products_delete_vendor" ON products
  FOR DELETE USING (auth.uid() = vendor_id);

-- Admin : tout
CREATE POLICY "admin_all_products" ON products
  FOR ALL USING (auth_user_role() = 'admin');


-- ── ORDERS ────────────────────────────────────────────────────────────
CREATE POLICY "orders_select_buyer" ON orders
  FOR SELECT USING (auth.uid() = buyer_id);

CREATE POLICY "orders_select_vendor" ON orders
  FOR SELECT USING (auth.uid() = vendor_id);

CREATE POLICY "orders_insert_buyer" ON orders
  FOR INSERT WITH CHECK (auth.uid() = buyer_id);

CREATE POLICY "orders_update_vendor" ON orders
  FOR UPDATE USING (auth.uid() = vendor_id);

CREATE POLICY "admin_all_orders" ON orders
  FOR ALL USING (auth_user_role() = 'admin');


-- ── ORDER_ITEMS ────────────────────────────────────────────────────────
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'order_items') THEN
    EXECUTE $p$
      CREATE POLICY "order_items_select" ON order_items
        FOR SELECT USING (
          EXISTS (SELECT 1 FROM orders o WHERE o.id = order_id AND (o.buyer_id = auth.uid() OR o.vendor_id = auth.uid()))
        )
    $p$;
    EXECUTE $p$
      CREATE POLICY "order_items_insert" ON order_items
        FOR INSERT WITH CHECK (
          EXISTS (SELECT 1 FROM orders o WHERE o.id = order_id AND o.buyer_id = auth.uid())
        )
    $p$;
  END IF;
END $$;


-- ── MESSAGES ──────────────────────────────────────────────────────────
CREATE POLICY "messages_select" ON messages
  FOR SELECT USING (
    (auth.uid() = from_id OR auth.uid() = to_id)
    AND (deleted = false OR deleted IS NULL)
  );

CREATE POLICY "messages_insert" ON messages
  FOR INSERT WITH CHECK (auth.uid() = from_id);

-- Destinataire marque lu, expéditeur peut soft-delete
CREATE POLICY "messages_update" ON messages
  FOR UPDATE USING (auth.uid() = to_id OR auth.uid() = from_id);


-- ── NOTIFICATIONS ─────────────────────────────────────────────────────
CREATE POLICY "notifs_select_own" ON notifications
  FOR SELECT USING (auth.uid() = user_id);

-- [FIX 3] INSERT autorisé côté client ET backend
-- Le backend (service_role) contourne toujours le RLS — cette policy sert aux triggers
CREATE POLICY "notifs_insert_any" ON notifications
  FOR INSERT WITH CHECK (true);

CREATE POLICY "notifs_update_own" ON notifications
  FOR UPDATE USING (auth.uid() = user_id);


-- ── REVIEWS ───────────────────────────────────────────────────────────
CREATE POLICY "reviews_select_public" ON reviews
  FOR SELECT USING (true);

CREATE POLICY "reviews_insert_buyer" ON reviews
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "reviews_update_own" ON reviews
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "reviews_delete_own" ON reviews
  FOR DELETE USING (auth.uid() = user_id);


-- ── OFFERS ────────────────────────────────────────────────────────────
CREATE POLICY "buyer_sees_own_offers"  ON offers FOR SELECT USING (buyer_id = auth.uid());
CREATE POLICY "vendor_sees_own_offers" ON offers FOR SELECT USING (vendor_id = auth.uid());
CREATE POLICY "buyer_creates_offers"   ON offers FOR INSERT WITH CHECK (buyer_id = auth.uid());
CREATE POLICY "vendor_updates_offers"  ON offers FOR UPDATE USING (vendor_id = auth.uid());


-- ── WISHLISTS ─────────────────────────────────────────────────────────
CREATE POLICY "own_wishlist" ON wishlists
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);


-- ── COUPONS ───────────────────────────────────────────────────────────
CREATE POLICY "coupons_select_active" ON coupons
  FOR SELECT USING (active = true AND (expires_at IS NULL OR expires_at > NOW()));

CREATE POLICY "admin_manages_coupons" ON coupons
  FOR ALL USING (auth_user_role() = 'admin');


-- ── RETURN REQUESTS ───────────────────────────────────────────────────
CREATE POLICY "buyer_sees_own_returns"  ON return_requests FOR SELECT USING (buyer_id = auth.uid());
CREATE POLICY "vendor_sees_returns"     ON return_requests FOR SELECT USING (vendor_id = auth.uid());
CREATE POLICY "buyer_creates_returns"   ON return_requests FOR INSERT WITH CHECK (buyer_id = auth.uid());
CREATE POLICY "admin_all_returns"       ON return_requests FOR ALL USING (auth_user_role() = 'admin');


-- ── DISPUTES ──────────────────────────────────────────────────────────
CREATE POLICY "buyer_sees_own_disputes" ON disputes FOR SELECT USING (buyer_id = auth.uid());
CREATE POLICY "vendor_sees_disputes"    ON disputes FOR SELECT USING (vendor_id = auth.uid());
CREATE POLICY "buyer_creates_disputes"  ON disputes FOR INSERT WITH CHECK (buyer_id = auth.uid());
CREATE POLICY "admin_all_disputes"      ON disputes FOR ALL USING (auth_user_role() = 'admin');


-- ── STOCK ALERTS ──────────────────────────────────────────────────────
CREATE POLICY "own_stock_alerts" ON stock_alerts
  FOR ALL USING (user_id = auth.uid());


-- ── FLASH SALES ───────────────────────────────────────────────────────
CREATE POLICY "public_flash_sales" ON flash_sales
  FOR SELECT USING (active = true AND ends_at > NOW());

CREATE POLICY "admin_flash_sales" ON flash_sales
  FOR ALL USING (auth_user_role() = 'admin');


-- ── PAYOUT REQUESTS ───────────────────────────────────────────────────
CREATE POLICY "vendor_payout_requests" ON payout_requests FOR SELECT USING (vendor_id = auth.uid());
CREATE POLICY "vendor_create_payouts"  ON payout_requests FOR INSERT WITH CHECK (vendor_id = auth.uid());
CREATE POLICY "admin_payout_requests"  ON payout_requests FOR ALL USING (auth_user_role() = 'admin');


-- ── PRODUCT QUESTIONS ─────────────────────────────────────────────────
CREATE POLICY "questions_public_read"   ON product_questions FOR SELECT USING (true);
CREATE POLICY "auth_create_questions"   ON product_questions FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "vendor_answers_question" ON product_questions FOR UPDATE USING (vendor_id = auth.uid());
CREATE POLICY "admin_all_questions"     ON product_questions FOR ALL USING (auth_user_role() = 'admin');


-- ── PENDING VENDORS ───────────────────────────────────────────────────
CREATE POLICY "public_insert_pending_vendor" ON pending_vendors
  FOR INSERT WITH CHECK (true);

CREATE POLICY "admin_all_pending_vendors" ON pending_vendors
  FOR ALL USING (auth_user_role() = 'admin');


-- ── TABLES ANALYTICS ──────────────────────────────────────────────────
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'vendor_daily_metrics') THEN
    EXECUTE $p$CREATE POLICY "vdm_vendor_own" ON vendor_daily_metrics FOR SELECT USING (vendor_id = auth.uid())$p$;
    EXECUTE $p$CREATE POLICY "vdm_admin_all" ON vendor_daily_metrics FOR ALL USING (auth_user_role() = 'admin')$p$;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'product_views') THEN
    EXECUTE $p$CREATE POLICY "pv_vendor_reads"   ON product_views FOR SELECT USING (vendor_id = auth.uid())$p$;
    EXECUTE $p$CREATE POLICY "pv_anyone_inserts" ON product_views FOR INSERT WITH CHECK (true)$p$;
  END IF;
END $$;


-- ── REFRESH TOKENS ────────────────────────────────────────────────────
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'refresh_tokens') THEN
    EXECUTE $p$CREATE POLICY "no_client_access_refresh_tokens" ON refresh_tokens FOR ALL USING (false)$p$;
  END IF;
END $$;


-- ── LOYALTY POINTS ────────────────────────────────────────────────────
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'loyalty_points') THEN
    EXECUTE $p$CREATE POLICY "own_loyalty_read"       ON loyalty_points FOR SELECT USING (user_id = auth.uid())$p$;
    EXECUTE $p$CREATE POLICY "system_inserts_loyalty" ON loyalty_points FOR INSERT WITH CHECK (true)$p$;
    EXECUTE $p$CREATE POLICY "admin_all_loyalty"      ON loyalty_points FOR ALL USING (auth_user_role() = 'admin')$p$;
  END IF;
END $$;


-- ── REVIEW VOTES ──────────────────────────────────────────────────────
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'review_votes') THEN
    EXECUTE $p$CREATE POLICY "own_review_votes" ON review_votes FOR ALL USING (user_id = auth.uid())$p$;
  END IF;
END $$;


-- ════════════════════════════════════════════════════════════════════
-- ÉTAPE 6 — [FIX 3] Corriger password_reset vs password_resets
-- Les 2 tables existent dans votre Supabase — sécuriser les deux
-- ════════════════════════════════════════════════════════════════════

-- password_resets (utilisée par server.js v3.1.2)
ALTER TABLE IF EXISTS password_resets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "password_resets_backend_only" ON password_resets;
CREATE POLICY "password_resets_backend_only" ON password_resets
  FOR ALL USING (false);  -- Accès exclusivement via service_role (server.js)

-- password_reset (ancienne table — on la sécurise aussi)
ALTER TABLE IF EXISTS password_reset ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "password_reset_backend_only" ON password_reset;
CREATE POLICY "password_reset_backend_only" ON password_reset
  FOR ALL USING (false);


-- ════════════════════════════════════════════════════════════════════
-- ÉTAPE 7 — Fonctions RPC utilitaires
-- ════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION decrement_stock(product_id UUID, qty INT)
RETURNS void AS $$
  UPDATE products SET stock = GREATEST(stock - qty, 0), updated_at = NOW()
  WHERE id = product_id;
$$ LANGUAGE sql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION increment_stock(product_id UUID, qty INT)
RETURNS void AS $$
  UPDATE products SET stock = stock + qty, updated_at = NOW()
  WHERE id = product_id;
$$ LANGUAGE sql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION decrement_stock(UUID, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION increment_stock(UUID, INT) TO authenticated;

-- Fonctions analytics (si les tables existent)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.routines WHERE routine_name = 'get_vendor_revenue_series') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.get_vendor_revenue_series(UUID, INT) TO authenticated';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.routines WHERE routine_name = 'record_product_view') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.record_product_view(UUID, UUID, TEXT) TO anon, authenticated';
  END IF;
END $$;


-- ════════════════════════════════════════════════════════════════════
-- ÉTAPE 8 — Vérification finale
-- ════════════════════════════════════════════════════════════════════

SELECT
  t.tablename                                   AS table_name,
  CASE t.rowsecurity WHEN true THEN '✅ RLS ON' ELSE '❌ RLS OFF' END AS rls,
  COUNT(p.policyname)                           AS nb_policies,
  STRING_AGG(p.policyname, ', ' ORDER BY p.policyname) AS policy_names
FROM pg_tables t
LEFT JOIN pg_policies p ON p.tablename = t.tablename AND p.schemaname = t.schemaname
WHERE t.schemaname = 'public'
  AND t.tablename NOT IN ('schema_migrations')
GROUP BY t.tablename, t.rowsecurity
ORDER BY t.rowsecurity ASC, t.tablename;

-- ═══════════════════════════════════════════════════════════════════
-- ✅ Résultat attendu : toutes les tables affichent "✅ RLS ON"
--    avec au moins 1 policy chacune
-- ═══════════════════════════════════════════════════════════════════
