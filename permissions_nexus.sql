-- ============================================================
-- NEXUS Market — Configuration complète des permissions
-- À exécuter dans Supabase SQL Editor
-- Rôles : anon · authenticated · vendor · admin (service_role)
-- ============================================================

-- ─── RAPPEL DES RÔLES SUPABASE ───────────────────────────────────────────────
-- anon          → visiteur non connecté (clé anon publique)
-- authenticated → utilisateur connecté (clé anon + JWT valide)
-- service_role  → votre backend/server.js (contourne toujours le RLS)
-- postgres      → superadmin interne (ne jamais exposer)
-- ─────────────────────────────────────────────────────────────────────────────


-- ════════════════════════════════════════════════════════════
-- 0. RÉVOQUER TOUT D'ABORD (table rase propre)
-- ════════════════════════════════════════════════════════════
-- Évite les permissions résiduelles oubliées

REVOKE ALL ON ALL TABLES    IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon, authenticated;


-- ════════════════════════════════════════════════════════════
-- 1. TABLE : profiles
-- ════════════════════════════════════════════════════════════
-- anon        → lecture publique des profils (nom, avatar, boutique)
-- authenticated → mise à jour de son propre profil uniquement

GRANT SELECT          ON public.profiles TO anon;
GRANT SELECT, UPDATE  ON public.profiles TO authenticated;
-- INSERT géré par le trigger handle_new_user (service_role)
-- DELETE interdit côté client → passe par le backend

-- Politique RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_select_public"   ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_own"       ON public.profiles;
DROP POLICY IF EXISTS "profiles_insert_trigger"   ON public.profiles;

CREATE POLICY "profiles_select_public" ON public.profiles
    FOR SELECT USING (true);                                   -- tout le monde voit les profils publics

CREATE POLICY "profiles_update_own" ON public.profiles
    FOR UPDATE USING (auth.uid() = id);                        -- chacun modifie seulement le sien

CREATE POLICY "profiles_insert_trigger" ON public.profiles
    FOR INSERT WITH CHECK (auth.uid() = id);                   -- trigger uniquement


-- ════════════════════════════════════════════════════════════
-- 2. TABLE : products
-- ════════════════════════════════════════════════════════════
-- anon        → lecture des produits actifs et modérés
-- authenticated → lecture + création/modification (vendeurs)

GRANT SELECT                        ON public.products TO anon;
GRANT SELECT, INSERT, UPDATE        ON public.products TO authenticated;

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "products_select_active"  ON public.products;
DROP POLICY IF EXISTS "products_select_own"     ON public.products;
DROP POLICY IF EXISTS "products_insert_vendor"  ON public.products;
DROP POLICY IF EXISTS "products_update_vendor"  ON public.products;
DROP POLICY IF EXISTS "products_delete_vendor"  ON public.products;

-- Visiteurs : uniquement les produits visibles
CREATE POLICY "products_select_active" ON public.products
    FOR SELECT USING (active = true AND moderated = true);

-- Vendeurs : voir aussi leurs propres produits en attente de modération
CREATE POLICY "products_select_own" ON public.products
    FOR SELECT USING (auth.uid() = vendor_id);

-- Vendeurs : créer un produit (lié à soi)
CREATE POLICY "products_insert_vendor" ON public.products
    FOR INSERT WITH CHECK (auth.uid() = vendor_id);

-- Vendeurs : modifier uniquement ses propres produits
CREATE POLICY "products_update_vendor" ON public.products
    FOR UPDATE USING (auth.uid() = vendor_id);

-- Vendeurs : supprimer uniquement ses propres produits
CREATE POLICY "products_delete_vendor" ON public.products
    FOR DELETE USING (auth.uid() = vendor_id);


-- ════════════════════════════════════════════════════════════
-- 3. TABLE : orders
-- ════════════════════════════════════════════════════════════
-- anon        → aucun accès
-- authenticated → acheteur voit ses commandes / vendeur voit les siennes

GRANT SELECT, INSERT ON public.orders TO authenticated;

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "orders_select_buyer"   ON public.orders;
DROP POLICY IF EXISTS "orders_select_vendor"  ON public.orders;
DROP POLICY IF EXISTS "orders_insert_buyer"   ON public.orders;
DROP POLICY IF EXISTS "orders_update_vendor"  ON public.orders;

-- Acheteur : voit ses propres commandes
CREATE POLICY "orders_select_buyer" ON public.orders
    FOR SELECT USING (auth.uid() = buyer_id);

-- Vendeur : voit les commandes qui le concernent
CREATE POLICY "orders_select_vendor" ON public.orders
    FOR SELECT USING (auth.uid() = vendor_id);

-- Acheteur : peut créer une commande (lié à soi)
CREATE POLICY "orders_insert_buyer" ON public.orders
    FOR INSERT WITH CHECK (auth.uid() = buyer_id);

-- Vendeur : peut mettre à jour le statut de ses commandes
CREATE POLICY "orders_update_vendor" ON public.orders
    FOR UPDATE USING (auth.uid() = vendor_id);


-- ════════════════════════════════════════════════════════════
-- 4. TABLE : order_items
-- ════════════════════════════════════════════════════════════
GRANT SELECT, INSERT ON public.order_items TO authenticated;

ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "order_items_select" ON public.order_items;
DROP POLICY IF EXISTS "order_items_insert" ON public.order_items;

CREATE POLICY "order_items_select" ON public.order_items
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM orders o
            WHERE o.id = order_id
              AND (o.buyer_id = auth.uid() OR o.vendor_id = auth.uid())
        )
    );

CREATE POLICY "order_items_insert" ON public.order_items
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM orders o
            WHERE o.id = order_id AND o.buyer_id = auth.uid()
        )
    );


-- ════════════════════════════════════════════════════════════
-- 5. TABLE : messages
-- ════════════════════════════════════════════════════════════
GRANT SELECT, INSERT, UPDATE ON public.messages TO authenticated;

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "messages_select"  ON public.messages;
DROP POLICY IF EXISTS "messages_insert"  ON public.messages;
DROP POLICY IF EXISTS "messages_update"  ON public.messages;

-- Expéditeur et destinataire voient le message (non supprimé)
CREATE POLICY "messages_select" ON public.messages
    FOR SELECT USING (
        (auth.uid() = from_id OR auth.uid() = to_id)
        AND deleted = false
    );

-- Uniquement l'expéditeur peut envoyer
CREATE POLICY "messages_insert" ON public.messages
    FOR INSERT WITH CHECK (auth.uid() = from_id);

-- Uniquement le destinataire peut marquer comme lu
CREATE POLICY "messages_update" ON public.messages
    FOR UPDATE USING (auth.uid() = to_id);


-- ════════════════════════════════════════════════════════════
-- 6. TABLE : reviews
-- ════════════════════════════════════════════════════════════
GRANT SELECT        ON public.reviews TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reviews TO authenticated;

ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "reviews_select_public"  ON public.reviews;
DROP POLICY IF EXISTS "reviews_insert_buyer"   ON public.reviews;
DROP POLICY IF EXISTS "reviews_update_own"     ON public.reviews;
DROP POLICY IF EXISTS "reviews_delete_own"     ON public.reviews;

CREATE POLICY "reviews_select_public" ON public.reviews
    FOR SELECT USING (true);

CREATE POLICY "reviews_insert_buyer" ON public.reviews
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "reviews_update_own" ON public.reviews
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "reviews_delete_own" ON public.reviews
    FOR DELETE USING (auth.uid() = user_id);


-- ════════════════════════════════════════════════════════════
-- 7. TABLE : notifications
-- ════════════════════════════════════════════════════════════
-- Créées uniquement par le backend (service_role)
-- Lues et marquées lues par leur propriétaire

GRANT SELECT, UPDATE ON public.notifications TO authenticated;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notifs_select_own"   ON public.notifications;
DROP POLICY IF EXISTS "notifs_update_own"   ON public.notifications;

CREATE POLICY "notifs_select_own" ON public.notifications
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "notifs_update_own" ON public.notifications
    FOR UPDATE USING (auth.uid() = user_id);


-- ════════════════════════════════════════════════════════════
-- 8. TABLE : coupons
-- ════════════════════════════════════════════════════════════
-- Lecture publique pour vérifier un code
-- Création/modification uniquement par le backend

GRANT SELECT ON public.coupons TO anon, authenticated;

ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "coupons_select_active" ON public.coupons;

CREATE POLICY "coupons_select_active" ON public.coupons
    FOR SELECT USING (active = true AND (expires_at IS NULL OR expires_at > NOW()));


-- ════════════════════════════════════════════════════════════
-- 9. TABLE : password_reset
-- ════════════════════════════════════════════════════════════
-- Aucun accès côté client — exclusivement via service_role (backend)

REVOKE ALL ON public.password_reset FROM anon, authenticated;

ALTER TABLE public.password_reset ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "password_reset_select_own"  ON public.password_reset;
DROP POLICY IF EXISTS "password_reset_delete_own"  ON public.password_reset;

CREATE POLICY "password_reset_select_own" ON public.password_reset
    FOR SELECT USING (
        email = (SELECT email FROM profiles WHERE id = auth.uid())
    );

CREATE POLICY "password_reset_delete_own" ON public.password_reset
    FOR DELETE USING (
        email = (SELECT email FROM profiles WHERE id = auth.uid())
    );


-- ════════════════════════════════════════════════════════════
-- 10. TABLE : email_logs
-- ════════════════════════════════════════════════════════════
-- Table non créée — section ignorée


-- ════════════════════════════════════════════════════════════
-- 11. TABLES ANALYTICS
-- ════════════════════════════════════════════════════════════

-- vendor_daily_metrics
GRANT SELECT ON public.vendor_daily_metrics TO authenticated;

ALTER TABLE public.vendor_daily_metrics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "vdm_vendor_own"   ON public.vendor_daily_metrics;
DROP POLICY IF EXISTS "vdm_admin_all"    ON public.vendor_daily_metrics;

CREATE POLICY "vdm_vendor_own" ON public.vendor_daily_metrics
    FOR SELECT USING (vendor_id = auth.uid());

CREATE POLICY "vdm_admin_all" ON public.vendor_daily_metrics
    FOR ALL USING (
        (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
    );

-- product_views
GRANT SELECT ON public.product_views TO authenticated;
GRANT INSERT ON public.product_views TO anon, authenticated;   -- enregistrer une vue

ALTER TABLE public.product_views ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pv_vendor_reads"    ON public.product_views;
DROP POLICY IF EXISTS "pv_anyone_inserts"  ON public.product_views;

CREATE POLICY "pv_vendor_reads" ON public.product_views
    FOR SELECT USING (vendor_id = auth.uid());

CREATE POLICY "pv_anyone_inserts" ON public.product_views
    FOR INSERT WITH CHECK (true);


-- ════════════════════════════════════════════════════════════
-- 12. FONCTIONS RPC — accès public sécurisé
-- ════════════════════════════════════════════════════════════
-- Les fonctions SECURITY DEFINER s'exécutent avec les droits
-- du créateur (postgres) mais filtrent en interne sur auth.uid()

GRANT EXECUTE ON FUNCTION public.get_vendor_revenue_series(UUID, INT)
    TO authenticated;

GRANT EXECUTE ON FUNCTION public.record_product_view(UUID, UUID, TEXT)
    TO anon, authenticated;

-- refresh_vendor_daily_metrics → backend uniquement (service_role)
REVOKE EXECUTE ON FUNCTION public.refresh_vendor_daily_metrics(DATE)
    FROM anon, authenticated;


-- ════════════════════════════════════════════════════════════
-- 13. VÉRIFICATION FINALE
-- ════════════════════════════════════════════════════════════

-- Rapport RLS par table
SELECT
    t.tablename                              AS table_name,
    CASE t.rowsecurity
        WHEN true  THEN '✅ Activé'
        WHEN false THEN '❌ Désactivé'
    END                                      AS rls,
    COUNT(p.policyname)                      AS nb_politiques,
    STRING_AGG(p.policyname, ' · '
        ORDER BY p.policyname)               AS politiques
FROM pg_tables t
LEFT JOIN pg_policies p
       ON p.tablename  = t.tablename
      AND p.schemaname = t.schemaname
WHERE t.schemaname = 'public'
GROUP BY t.tablename, t.rowsecurity
ORDER BY t.rowsecurity ASC, t.tablename;
