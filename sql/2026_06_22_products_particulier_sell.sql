-- ════════════════════════════════════════════════════════════════════════════
--  NEXUS Market — Vente occasionnelle par les comptes « particuliers »
--
--  Le compte acheteur (renommé « Acheteur / Vendeur particulier ») peut désormais
--  publier occasionnellement des articles. saveProduct insère dans `products` avec
--  vendor_id = id de l'utilisateur. On autorise donc tout utilisateur authentifié à
--  gérer SES PROPRES produits (vendor_id = auth.uid()). Policies additives : elles
--  ne retirent rien aux policies vendeur/admin existantes (OR logique).
--
--  ⚠️ À exécuter dans Supabase → SQL Editor. Idempotent.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS products_insert_own ON public.products;
CREATE POLICY products_insert_own ON public.products
  FOR INSERT WITH CHECK (vendor_id = auth.uid());

DROP POLICY IF EXISTS products_update_own ON public.products;
CREATE POLICY products_update_own ON public.products
  FOR UPDATE USING (vendor_id = auth.uid()) WITH CHECK (vendor_id = auth.uid());

DROP POLICY IF EXISTS products_delete_own ON public.products;
CREATE POLICY products_delete_own ON public.products
  FOR DELETE USING (vendor_id = auth.uid());

COMMIT;
