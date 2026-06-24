-- 2026_06_24_residual_hardening.sql
-- ============================================================================
-- [SÉCURITÉ] Résiduels de l'audit 2026-06-24.
-- ============================================================================

-- 1. orders INSERT : usurpation de buyer_id.
--    Les policies "Allow authenticated insert" (with_check auth.role()=
--    'authenticated') et "Buyers insert orders" (with_check auth.uid() IS NOT
--    NULL) permettaient d'insérer une commande avec un buyer_id ARBITRAIRE.
--    Supprimées. Restent orders_insert_buyer / "Users can insert own orders"
--    (buyer_id = auth.uid()). Le chemin principal create_order_atomic est
--    SECURITY DEFINER (insensible aux policies). Vérifié : insert self OK,
--    insert au nom d'autrui -> RLS violation.
DROP POLICY IF EXISTS "Allow authenticated insert" ON public.orders;
DROP POLICY IF EXISTS "Buyers insert orders" ON public.orders;

-- 2. app_config : FUITE DE SECRETS (CRITIQUE).
--    La policy app_config_auth_select (SELECT, auth.role()='authenticated')
--    laissait TOUT utilisateur connecté lire TOUTES les clés, dont
--    nexus_main_config.brevoApiKey (clé API Brevo) et nexus_wa_cfg.secret
--    (secret WhatsApp GreenAPI). Remplacée par une policy qui EXCLUT ces clés
--    à secrets. La lecture publique de nexus_monetization_cfg garde sa policy
--    dédiée. main_config / wa_cfg -> admin & service_role uniquement.
--    ⚠️ Ces secrets ayant été exposés, ils DOIVENT être révoqués/rotés.
DROP POLICY IF EXISTS "app_config_auth_select" ON public.app_config;
DROP POLICY IF EXISTS "app_config_auth_select_safe" ON public.app_config;  -- idempotent : migration rejouable
CREATE POLICY "app_config_auth_select_safe" ON public.app_config FOR SELECT
  USING (auth.role() = 'authenticated' AND key NOT IN ('nexus_main_config','nexus_wa_cfg'));
