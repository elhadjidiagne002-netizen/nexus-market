-- ============================================================================
-- 2026_07_07_rls_grant_hardening.sql
-- Audit sécurité base Supabase (2026-07-07) — corrections CRITIQUES/ÉLEVÉES.
--
-- Périmètre = sous-ensemble NON CASSANT vérifié :
--   * colonnes/tables : aucune référence dans public/*.html (front=0)
--   * fonctions révoquées : AUCUNE n'est dans la whitelist des .rpc() du client
--     et aucune n'est appelée par une Function Cloudflare via un JWT utilisateur
--     (les appels back utilisent SUPABASE_SERVICE_KEY = service_role, qui bypasse
--     les GRANT). Les fonctions admin appelées par le panel (admin_approve_user,
--     admin_assign_delivery, nexus_cleanup_old_data, send_ambassador_monthly_report,
--     create_delivery, louma_buy, add_cashback…) NE sont PAS révoquées ici : elles
--     doivent recevoir un garde interne is_admin()/auth.uid() (cf. Tier 2 ci-dessous).
-- ============================================================================

-- #2 CRITIQUE — whatsapp_config : le token/secret Green API ne doit jamais être
--    lisible côté client. Suppression de la policy qui l'ouvrait à tout compte
--    connecté + REVOKE colonne. (Reste admin-only via wa_admin_all / wa_cfg_admin.)
DROP POLICY IF EXISTS wa_service_read ON public.whatsapp_config;
REVOKE SELECT ON public.whatsapp_config FROM anon, authenticated;

-- #1 CRITIQUE — profiles : IBAN / NINEA / hash mot de passe ne doivent jamais être
--    lisibles côté client (la policy vendeur exposait ces lignes à tout inscrit).
REVOKE SELECT (iban, ninea, password_hash) ON public.profiles FROM anon, authenticated;

-- #3 ÉLEVÉ — fonctions SECURITY DEFINER dangereuses, NON appelées par le client :
--    révocation de l'exécution publique (restent appelables par service_role / cron / triggers).
REVOKE EXECUTE ON FUNCTION
  public.activate_boost(uuid),
  public.decrement_stock(uuid, integer),
  public.increment_stock(uuid, integer),
  public.get_conversations(uuid),
  public.nexus_send_whatsapp(text, text, text, uuid, jsonb),
  public.get_all_tables(),
  public.get_rls_policies(),
  public.get_schema_info(),
  public.dispatch_tick_all(),
  public.save_invoice(text, text, uuid, uuid, numeric, numeric, numeric, numeric, numeric, text, jsonb),
  public.save_invoice(text, uuid, uuid, uuid, numeric, numeric, numeric, numeric, numeric, text, jsonb),
  public.release_stock(jsonb),
  public.notify_stock_alerts(uuid),
  public.find_nearest_couriers(double precision, double precision, integer, numeric),
  public.generate_invoice_number(text),
  public.increment_coupon_usage(uuid),
  public.api_reset_daily_quotas(),
  public.rate_limits_purge(integer),
  public.recompute_vendor_trust(),
  public.release_expired_transport_holds(),
  public.expire_boosts(),
  public.expire_flash_sales(),
  public.expire_vendor_pro(),
  public.nexus_expire_annonces(),
  public.nexus_expire_boosts(),
  public.nexus_maintenance()
  FROM anon, authenticated;

-- ============================================================================
-- Cleanup séparé (peut échouer si dépendance) : suppression du vestige
-- password_hash (auth custom abandonnée — Supabase gère les mots de passe).
-- Exécuté hors de cette migration critique pour ne pas la faire échouer.
--   ALTER TABLE public.profiles DROP COLUMN IF EXISTS password_hash;
-- ============================================================================

-- ============================================================================
-- TIER 2 — À FAIRE (nécessite édition de corps de fonctions / policies, revue) :
--  * Ajouter un garde is_admin() dans : admin_assign_delivery, nexus_cleanup_old_data,
--    send_ambassador_monthly_report (appelées par le panel admin, non gardées).
--  * Scoper auth.uid() dans : create_delivery, accept_delivery, louma_buy, add_cashback.
--  * Policies USING(true) écriture publique : annonces_express, troc_listings/proposals,
--    stock_history, audit_logs (→ service_role), public_chat_reactions DELETE (→ owner),
--    product_views, affiliate_clicks, search_logs, vendor_referrals, newsletter_subscribers.
--  * ALTER FUNCTION ... SET search_path='' sur les 67 fonctions flaggées.
--  * Vues SECURITY DEFINER → security_invoker=on (gardées is_admin() en interne, OK).
--  * Bucket storage nexus-stories : désactiver le listing anonyme.
--  * Extensions pg_trgm/unaccent/pg_net → schéma extensions.
--  * Supprimer tables vestiges : password_reset, password_resets, token_blacklist.
-- ============================================================================
