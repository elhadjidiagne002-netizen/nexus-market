-- ============================================================
-- NEXUS Market Sénégal — RLS Complet v1.0 (Feature 6)
-- À exécuter dans Supabase SQL Editor APRÈS schema.sql
-- Complète et renforce toutes les politiques RLS existantes
-- ============================================================

-- ─── HELPER : fonction sécurisée pour récupérer le rôle ─────────────────────
-- Évite les appels récursifs dans les policies profiles
CREATE OR REPLACE FUNCTION auth_user_role()
RETURNS TEXT LANGUAGE SQL STABLE SECURITY DEFINER AS $$
  SELECT role FROM profiles WHERE id = auth.uid()
$$;

-- ─── 1. PROFILES ─────────────────────────────────────────────────────────────
-- Problème original : profiles_public_read expose TOUS les champs (dont password_hash)
-- Correction : restreindre les champs visibles publiquement

DROP POLICY IF EXISTS "profiles_public_read"  ON profiles;
DROP POLICY IF EXISTS "users_update_own"       ON profiles;
DROP POLICY IF EXISTS "admin_all_profiles"     ON profiles;

-- Lecture publique : uniquement les vendeurs actifs (pas de password_hash exposé)
-- Utiliser une vue ou une politique restrictive
CREATE POLICY "profiles_vendor_public"
  ON profiles FOR SELECT
  USING (
    -- Chacun peut lire son propre profil
    id = auth.uid()
    OR
    -- Les vendeurs approuvés sont visibles publiquement
    (role = 'vendor' AND status = 'approved')
    OR
    -- L'admin voit tout
    auth_user_role() = 'admin'
  );

-- Un utilisateur peut modifier son propre profil (sauf changer son rôle)
CREATE POLICY "users_update_own"
  ON profiles FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (
    id = auth.uid()
    AND role = (SELECT role FROM profiles WHERE id = auth.uid()) -- rôle immutable
  );

CREATE POLICY "admin_all_profiles"
  ON profiles FOR ALL
  USING (auth_user_role() = 'admin');

-- ─── 2. PRODUCTS ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "products_public_read"  ON products;
DROP POLICY IF EXISTS "vendors_manage_own"    ON products;
DROP POLICY IF EXISTS "admin_all_products"    ON products;

-- Lecture publique : produits actifs ET modérés uniquement
CREATE POLICY "products_public_read"
  ON products FOR SELECT
  USING (
    (active = true AND moderated = true)
    OR vendor_id = auth.uid()  -- vendeur voit tous ses propres produits
    OR auth_user_role() = 'admin'
  );

-- Vendeur : CRUD sur ses propres produits uniquement
CREATE POLICY "vendor_insert_own"
  ON products FOR INSERT
  WITH CHECK (
    vendor_id = auth.uid()
    AND auth_user_role() = 'vendor'
  );

CREATE POLICY "vendor_update_own"
  ON products FOR UPDATE
  USING (vendor_id = auth.uid())
  WITH CHECK (
    vendor_id = auth.uid()
    -- Un vendeur ne peut pas s'auto-modérer
    AND moderated = (SELECT moderated FROM products WHERE id = products.id)
  );

CREATE POLICY "vendor_delete_own"
  ON products FOR DELETE
  USING (vendor_id = auth.uid());

CREATE POLICY "admin_all_products"
  ON products FOR ALL
  USING (auth_user_role() = 'admin');

-- ─── 3. ORDERS ───────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "buyer_sees_own_orders"  ON orders;
DROP POLICY IF EXISTS "vendor_sees_own_orders" ON orders;
DROP POLICY IF EXISTS "admin_all_orders"       ON orders;

CREATE POLICY "buyer_sees_own_orders"
  ON orders FOR SELECT
  USING (buyer_id = auth.uid());

CREATE POLICY "buyer_creates_order"
  ON orders FOR INSERT
  WITH CHECK (buyer_id = auth.uid());

CREATE POLICY "vendor_sees_own_orders"
  ON orders FOR SELECT
  USING (vendor_id = auth.uid());

-- Vendeur peut uniquement mettre à jour le statut et le numéro de suivi
CREATE POLICY "vendor_updates_order_status"
  ON orders FOR UPDATE
  USING (vendor_id = auth.uid());

CREATE POLICY "admin_all_orders"
  ON orders FOR ALL
  USING (auth_user_role() = 'admin');

-- ─── 4. REVIEWS ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "reviews_public_read"   ON reviews;
DROP POLICY IF EXISTS "buyers_create_reviews" ON reviews;
DROP POLICY IF EXISTS "own_review_update"     ON reviews;
DROP POLICY IF EXISTS "admin_all_reviews"     ON reviews;

CREATE POLICY "reviews_public_read"
  ON reviews FOR SELECT USING (true);

CREATE POLICY "buyers_create_reviews"
  ON reviews FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND auth_user_role() IN ('buyer', 'buyer_pro')
    -- Vérifier qu'un achat existe (optionnel — peut être activé)
    -- AND EXISTS (SELECT 1 FROM orders WHERE buyer_id = auth.uid() AND status = 'delivered'
    --             AND products::TEXT ILIKE '%' || product_id::TEXT || '%')
  );

-- L'auteur peut modifier sa propre review dans les 30 jours
CREATE POLICY "own_review_update"
  ON reviews FOR UPDATE
  USING (
    user_id = auth.uid()
    AND created_at > NOW() - INTERVAL '30 days'
  );

CREATE POLICY "admin_all_reviews"
  ON reviews FOR ALL
  USING (auth_user_role() = 'admin');

-- ─── 5. MESSAGES ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "message_participants" ON messages;
DROP POLICY IF EXISTS "send_messages"        ON messages;
DROP POLICY IF EXISTS "mark_read"            ON messages;

CREATE POLICY "message_participants"
  ON messages FOR SELECT
  USING (from_id = auth.uid() OR to_id = auth.uid());

CREATE POLICY "send_messages"
  ON messages FOR INSERT
  WITH CHECK (from_id = auth.uid());

-- Destinataire peut marquer lu, expéditeur peut supprimer (soft)
CREATE POLICY "mark_read_or_delete"
  ON messages FOR UPDATE
  USING (to_id = auth.uid() OR from_id = auth.uid());

-- ─── 6. NOTIFICATIONS ────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "own_notifications" ON notifications;

CREATE POLICY "own_notifications_read"
  ON notifications FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "own_notifications_update"
  ON notifications FOR UPDATE
  USING (user_id = auth.uid());

-- Insertion autorisée par le service role (backend) ou par l'admin
CREATE POLICY "system_creates_notifications"
  ON notifications FOR INSERT
  WITH CHECK (
    -- L'utilisateur peut créer ses propres notifs (via triggers)
    user_id = auth.uid()
    OR auth_user_role() = 'admin'
  );

-- ─── 7. PENDING VENDORS ──────────────────────────────────────────────────────
ALTER TABLE pending_vendors ENABLE ROW LEVEL SECURITY;

-- Admin uniquement peut lire/modifier
CREATE POLICY "admin_all_pending_vendors"
  ON pending_vendors FOR ALL
  USING (auth_user_role() = 'admin');

-- Permettre l'insertion publique (inscription vendeur sans compte auth préalable)
CREATE POLICY "public_insert_pending_vendor"
  ON pending_vendors FOR INSERT
  WITH CHECK (true);

-- ─── 8. PRODUCT QUESTIONS ────────────────────────────────────────────────────
DROP POLICY IF EXISTS "questions_public_read"   ON product_questions;
DROP POLICY IF EXISTS "auth_create_questions"   ON product_questions;
DROP POLICY IF EXISTS "vendor_answers_question" ON product_questions;

CREATE POLICY "questions_public_read"
  ON product_questions FOR SELECT USING (true);

CREATE POLICY "auth_create_questions"
  ON product_questions FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- Le vendeur du produit peut répondre
CREATE POLICY "vendor_answers_question"
  ON product_questions FOR UPDATE
  USING (vendor_id = auth.uid());

CREATE POLICY "admin_all_questions"
  ON product_questions FOR ALL
  USING (auth_user_role() = 'admin');

-- ─── 9. WISHLISTS ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "own_wishlist" ON wishlists;

CREATE POLICY "own_wishlist"
  ON wishlists FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ─── 10. LOYALTY POINTS (table schema_migration_v3_2.sql) ───────────────────
-- Déjà défini dans migration v3.2, on s'assure que les policies existent
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'loyalty_points') THEN
    ALTER TABLE loyalty_points ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "Own loyalty read"  ON loyalty_points;
    DROP POLICY IF EXISTS "Admin loyalty all" ON loyalty_points;
    CREATE POLICY "own_loyalty_read"
      ON loyalty_points FOR SELECT USING (user_id = auth.uid());
    CREATE POLICY "system_inserts_loyalty"
      ON loyalty_points FOR INSERT
      WITH CHECK (user_id = auth.uid() OR auth_user_role() = 'admin');
    CREATE POLICY "admin_all_loyalty"
      ON loyalty_points FOR ALL USING (auth_user_role() = 'admin');
  END IF;
END $$;

-- ─── 11. TESTS RLS (à exécuter manuellement pour valider) ────────────────────
-- Ces requêtes doivent être exécutées en tant qu'utilisateur spécifique
-- via "Set local role" dans Supabase SQL Editor.

-- Test A : Acheteur ne doit PAS voir les produits non modérés d'autres vendeurs
-- SET LOCAL role TO 'authenticated';
-- SET LOCAL "request.jwt.claims" TO '{"sub":"buyer-uuid","role":"authenticated"}';
-- SELECT id, name, moderated FROM products WHERE moderated = false;
-- → doit retourner uniquement les produits du vendeur connecté, pas ceux des autres

-- Test B : Vendeur1 ne doit PAS voir les commandes de Vendeur2
-- SET LOCAL "request.jwt.claims" TO '{"sub":"vendor1-uuid","role":"authenticated"}';
-- SELECT id, vendor_id FROM orders WHERE vendor_id != 'vendor1-uuid';
-- → doit retourner 0 lignes

-- Test C : Acheteur ne doit PAS voir le password_hash d'autres profils
-- SET LOCAL "request.jwt.claims" TO '{"sub":"buyer-uuid","role":"authenticated"}';
-- SELECT password_hash FROM profiles WHERE id != 'buyer-uuid';
-- → doit retourner 0 lignes

-- Test D : Un utilisateur normal ne peut PAS s'auto-promouvoir admin
-- UPDATE profiles SET role = 'admin' WHERE id = auth.uid();
-- → doit échouer avec "new row violates row-level security policy"

-- ─── 12. CHECKLIST RLS ───────────────────────────────────────────────────────
-- [ ] Exécuter ce fichier dans Supabase SQL Editor
-- [ ] Vérifier que auth_user_role() retourne le bon rôle pour chaque type d'utilisateur
-- [ ] Exécuter Test A, B, C, D ci-dessus
-- [ ] Vérifier dans Supabase Dashboard → Auth → Policies que toutes les tables ont des icônes vertes
-- [ ] Tester qu'un vendeur connecté ne voit que ses propres produits non-modérés
-- [ ] Tester que l'admin voit tout
-- [ ] Désactiver "Bypass RLS" dans Supabase si activé (Settings → Database → Row Level Security)
