-- 2026_06_20_pros_admin.sql
-- Modération admin de NEXUS Pro (artisans / ouvriers) : accès complet
-- (lecture de TOUTES les fiches y compris hidden/banned, mise à jour du statut,
-- suppression) pour les comptes admin. Calqué sur 2026_06_07_troc_admin.sql.
--
-- Le panneau admin (AdminDashboard → onglet « 🔧 Pros (artisans) ») lit/écrit
-- directement la table `pros` via le client Supabase authentifié de l'admin ;
-- ces policies lui en donnent le droit (les RLS existantes ne laissaient voir
-- que les fiches status='active' et modifier que la sienne).
--
-- ⚠️ À exécuter APRÈS 2026_06_14_nexus_pros.sql, sur la base Supabase déployée
--    (SQL Editor ou psql). Idempotent / rejouable.

BEGIN;

-- Admin : tous droits (SELECT/INSERT/UPDATE/DELETE) sur les fiches pro.
DROP POLICY IF EXISTS pros_admin_all ON public.pros;
CREATE POLICY pros_admin_all ON public.pros FOR ALL
  USING      ((SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin')
  WITH CHECK ((SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin');

-- Admin : modération des avis pros (masquage/suppression) si la table existe.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name = 'pro_reviews') THEN
    EXECUTE 'DROP POLICY IF EXISTS pro_reviews_admin_all ON public.pro_reviews';
    EXECUTE 'CREATE POLICY pro_reviews_admin_all ON public.pro_reviews FOR ALL '
         || 'USING ((SELECT role FROM public.profiles WHERE id = auth.uid()) = ''admin'') '
         || 'WITH CHECK ((SELECT role FROM public.profiles WHERE id = auth.uid()) = ''admin'')';
  END IF;
END $$;

COMMIT;
