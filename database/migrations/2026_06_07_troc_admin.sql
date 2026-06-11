-- 2026_06_07_troc_admin.sql
-- Modération admin de NEXUS Troc : accès complet (lecture/masquage/suppression) aux
-- annonces et propositions de troc pour les comptes admin. Calqué sur la politique
-- admin_all_products. À exécuter APRÈS 2026_06_07_troc.sql.
--
-- ⚠️ À exécuter sur la base Supabase déployée (SQL Editor ou psql).

BEGIN;

DROP POLICY IF EXISTS troc_admin_all ON public.troc_listings;
CREATE POLICY troc_admin_all ON public.troc_listings FOR ALL
  USING      ((SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin')
  WITH CHECK ((SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin');

DROP POLICY IF EXISTS troc_prop_admin_all ON public.troc_proposals;
CREATE POLICY troc_prop_admin_all ON public.troc_proposals FOR ALL
  USING      ((SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin')
  WITH CHECK ((SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin');

COMMIT;
