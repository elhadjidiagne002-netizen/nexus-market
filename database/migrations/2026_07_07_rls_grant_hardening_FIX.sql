-- ============================================================================
-- 2026_07_07_rls_grant_hardening_FIX.sql
-- CORRECTIF du Tier 1 : deux instructions n'avaient pas pris effet.
--   1. `REVOKE SELECT (iban,ninea,password_hash)` était INOPÉRANT car le rôle
--      `authenticated` détient un GRANT SELECT au niveau TABLE sur profiles
--      (un revoke colonne ne soustrait pas d'un grant table). → on révoque le
--      SELECT table puis on ne re-GRANT que les colonnes NON sensibles.
--   2. Le `REVOKE EXECUTE` groupé (26 fonctions) a échoué en bloc → on le refait
--      en boucle par signature (robuste aux surcharges/typos).
-- Déjà OK (ne pas refaire) : whatsapp_config revoke, get_conversations revoke, Tier 2.
-- ============================================================================

-- #1 profiles — fermer la fuite IBAN / NINEA / password_hash (anon n'a déjà aucun accès)
REVOKE SELECT ON public.profiles FROM authenticated;
GRANT SELECT (
  id, email, name, avatar, role, status, phone, bio, rating, total_sales, commission_rate,
  shop_category, last_login, created_at, updated_at, company_name, payout_method,
  onboarding_complete, github_id, github_login, github_avatar, shop_name, address,
  payout_destination, shop_description, referral_code, whatsapp_number, wave_phone, orange_phone,
  logo, opening_hours, return_policy, whatsapp_prefix, lang, owner_name, rc, structure_type,
  payment_method, bank_name, email_confirmed, admin_approved, approved_by, approved_at_dt,
  email_confirmed_at, shop_desc, vehicle_type, is_courier, courier_status, courier_vehicle,
  courier_zone, current_lat, current_lng, location_updated_at, courier_rating, courier_trips,
  geolocation, is_breeder, is_trusted, trust_score, trust_computed_at, is_pro, pro_until,
  pro_plan, home_lat, home_lng
) ON public.profiles TO authenticated;

-- #3 REVOKE EXECUTE robuste (boucle par signature réelle)
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = ANY(ARRAY[
      'activate_boost','decrement_stock','increment_stock','nexus_send_whatsapp',
      'get_all_tables','get_rls_policies','get_schema_info','dispatch_tick_all','save_invoice',
      'release_stock','notify_stock_alerts','find_nearest_couriers','generate_invoice_number',
      'increment_coupon_usage','api_reset_daily_quotas','rate_limits_purge',
      'release_expired_transport_holds','expire_boosts','expire_flash_sales','expire_vendor_pro',
      'nexus_expire_annonces','nexus_expire_boosts','nexus_maintenance'])
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon, authenticated', r.sig);
  END LOOP;
END $$;

-- ============================================================================
-- RÉSIDUEL (recommandé, à tester en staging) : après ce correctif, un compte
-- connecté peut encore lire les colonnes de contact/paiement des vendeurs
-- approuvés (wave_phone, orange_phone, bank_name, payout_destination, address…)
-- via la policy de visibilité vendeur. Fix propre = restreindre la policy SELECT
-- de profiles au propriétaire (auth.uid()=id) + admin, et exposer l'info vendeur
-- publique uniquement via la vue `vendor_profiles` / le RPC get_vendor_profile
-- (déjà utilisés par le front). Nécessite de vérifier qu'aucun SELECT direct sur
-- profiles(autre vendeur) n'existe côté client avant de l'appliquer.
-- ============================================================================
