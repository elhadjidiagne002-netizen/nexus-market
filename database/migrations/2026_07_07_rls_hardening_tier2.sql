-- ============================================================================
-- 2026_07_07_rls_hardening_tier2.sql
-- Tier 2 de l'audit sécurité DB (suite de 2026_07_07_rls_grant_hardening.sql).
--
-- Contrairement au Tier 1 (REVOKE, non cassant), le Tier 2 modifie des CORPS de
-- fonctions et des POLICIES d'écriture appelées par le client. Chaque section est
-- annotée. Les points marqués « ⚠️ VÉRIFIER » dépendent du fait que le client
-- renseigne bien <col>=auth.uid() à l'INSERT — à valider en staging avant prod.
--
-- NON APPLIQUÉ automatiquement (changement prod). Exécuter après revue.
-- ============================================================================


-- ============================================================================
-- SECTION A — Gardes d'autorisation dans les fonctions appelées par le client
--   (impossible de REVOKE : le panel admin / les utilisateurs les appellent).
--   Corps repris à l'identique, seule la ligne [SEC Tier2] est ajoutée.
-- ============================================================================

-- A1. admin_assign_delivery : réservé aux admins (aucun garde auparavant).
CREATE OR REPLACE FUNCTION public.admin_assign_delivery(p_delivery_id uuid, p_courier_id uuid)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE v_row deliveries%ROWTYPE; v_c RECORD;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'admin requis'; END IF;  -- [SEC Tier2]
  UPDATE public.deliveries SET courier_id = p_courier_id, status = 'accepted', assigned_at = now()
   WHERE id = p_delivery_id;
  UPDATE public.delivery_offers SET status = 'expired', responded_at = now()
   WHERE delivery_id = p_delivery_id AND status IN ('pending','queued');
  INSERT INTO public.delivery_offers (delivery_id, courier_id, status, seq, responded_at)
  VALUES (p_delivery_id, p_courier_id, 'accepted', -1, now()) ON CONFLICT DO NOTHING;
  UPDATE public.couriers SET is_available = false WHERE user_id = p_courier_id;
  UPDATE public.profiles SET courier_status = 'busy' WHERE id = p_courier_id;
  PERFORM public._free_courier_offers(p_courier_id, p_delivery_id);
  SELECT * INTO v_row FROM public.deliveries WHERE id = p_delivery_id;
  SELECT user_id, name, phone INTO v_c FROM public.couriers WHERE user_id = p_courier_id;
  RETURN jsonb_build_object('ok', true, 'delivery_id', p_delivery_id,
    'courier', jsonb_build_object('user_id', v_c.user_id, 'name', v_c.name, 'phone', v_c.phone),
    'buyer_name', v_row.buyer_name, 'buyer_phone', v_row.buyer_phone);
END;
$function$;

-- A2. accept_delivery : un coursier ne peut accepter QUE pour lui-même.
CREATE OR REPLACE FUNCTION public.accept_delivery(p_delivery_id uuid, p_courier_id uuid)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE v_ok boolean := false; v_row deliveries%ROWTYPE;
BEGIN
  IF auth.uid() IS DISTINCT FROM p_courier_id THEN RAISE EXCEPTION 'non autorisé'; END IF;  -- [SEC Tier2]
  IF NOT EXISTS (SELECT 1 FROM public.delivery_offers
     WHERE delivery_id = p_delivery_id AND courier_id = p_courier_id AND status = 'pending') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_your_turn');
  END IF;
  UPDATE public.deliveries SET courier_id = p_courier_id, status = 'accepted', assigned_at = now()
   WHERE id = p_delivery_id AND courier_id IS NULL AND status IN ('searching','pending')
  RETURNING true INTO v_ok;
  IF v_ok IS NULL OR v_ok = false THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_taken');
  END IF;
  UPDATE public.delivery_offers SET status = 'accepted', responded_at = now()
   WHERE delivery_id = p_delivery_id AND courier_id = p_courier_id;
  UPDATE public.delivery_offers SET status = 'expired', responded_at = now()
   WHERE delivery_id = p_delivery_id AND courier_id <> p_courier_id AND status IN ('pending','queued');
  UPDATE public.couriers SET is_available = false WHERE user_id = p_courier_id;
  UPDATE public.profiles SET courier_status = 'busy' WHERE id = p_courier_id;
  PERFORM public._free_courier_offers(p_courier_id, p_delivery_id);
  SELECT * INTO v_row FROM public.deliveries WHERE id = p_delivery_id;
  RETURN jsonb_build_object('ok', true, 'delivery_id', p_delivery_id,
    'buyer_name', v_row.buyer_name, 'buyer_phone', v_row.buyer_phone,
    'pickup_label', v_row.pickup_label, 'dropoff_label', v_row.dropoff_label,
    'pickup_lat', v_row.pickup_lat, 'pickup_lng', v_row.pickup_lng,
    'dropoff_lat', v_row.dropoff_lat, 'dropoff_lng', v_row.dropoff_lng,
    'items_desc', v_row.items_desc, 'courier_payout', v_row.courier_payout);
END;
$function$;

-- A3. louma_buy : exiger une connexion (empêche l'épuisement anonyme du stock).
CREATE OR REPLACE FUNCTION public.louma_buy(p_offer_id uuid)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_remaining integer;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'connexion requise'; END IF;  -- [SEC Tier2]
  UPDATE public.louma_offers SET sold = sold + 1
   WHERE id = p_offer_id AND status = 'approved' AND sold < qty
  RETURNING (qty - sold) INTO v_remaining;
  IF NOT found THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'SOLD_OUT_OR_INACTIVE');
  END IF;
  RETURN jsonb_build_object('ok', true, 'remaining', v_remaining);
END;
$function$;

-- A4. nexus_cleanup_old_data : réservé admin OU appel service/cron (auth.uid() NULL).
CREATE OR REPLACE FUNCTION public.nexus_cleanup_old_data()
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _deleted jsonb := '{}'; _n int;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_admin() THEN RAISE EXCEPTION 'admin requis'; END IF;  -- [SEC Tier2]
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='notifications' AND column_name='created_at') THEN
    DELETE FROM notifications WHERE read = true AND created_at < now() - INTERVAL '30 days';
    GET DIAGNOSTICS _n = ROW_COUNT; _deleted := _deleted || jsonb_build_object('notifications_read_30d', _n);
    DELETE FROM notifications WHERE created_at < now() - INTERVAL '90 days';
    GET DIAGNOSTICS _n = ROW_COUNT; _deleted := _deleted || jsonb_build_object('notifications_all_90d', _n);
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='search_logs' AND column_name='created_at') THEN
    DELETE FROM search_logs WHERE created_at < now() - INTERVAL '90 days';
    GET DIAGNOSTICS _n = ROW_COUNT; _deleted := _deleted || jsonb_build_object('search_logs_90d', _n);
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='audit_logs' AND column_name='created_at') THEN
    DELETE FROM audit_logs WHERE created_at < now() - INTERVAL '90 days';
    GET DIAGNOSTICS _n = ROW_COUNT; _deleted := _deleted || jsonb_build_object('audit_logs_90d', _n);
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='sms_logs' AND column_name='created_at') THEN
    DELETE FROM sms_logs WHERE created_at < now() - INTERVAL '60 days';
    GET DIAGNOSTICS _n = ROW_COUNT; _deleted := _deleted || jsonb_build_object('sms_logs_60d', _n);
  END IF;
  DELETE FROM maintenance_log WHERE run_at < now() - INTERVAL '180 days';
  GET DIAGNOSTICS _n = ROW_COUNT; _deleted := _deleted || jsonb_build_object('maintenance_log_180d', _n);
  INSERT INTO maintenance_log (job, result, run_at) VALUES ('nexus_cleanup_rpc', _deleted, now());
  RETURN _deleted;
END;
$function$;

-- A5. send_ambassador_monthly_report : réservé admin OU service/cron.
CREATE OR REPLACE FUNCTION public.send_ambassador_monthly_report(p_month text DEFAULT to_char(now(), 'YYYY-MM'::text))
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_rec record; v_count integer := 0; v_msg text; v_month text;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_admin() THEN RAISE EXCEPTION 'admin requis'; END IF;  -- [SEC Tier2]
  v_month := to_char(to_date(p_month, 'YYYY-MM'), 'Month YYYY');
  FOR v_rec IN
    SELECT a.user_id, a.code, a.level, a.total_earned, a.total_referrals, a.commission_rate, p.phone, p.name
    FROM ambassadors a JOIN profiles p ON p.id = a.user_id
    WHERE a.active = true AND p.phone IS NOT NULL AND a.total_earned > 0
  LOOP
    v_msg := '📊 *Relevé Ambassadeur NEXUS — ' || v_month || '*' || chr(10) ||
             '──────────────────────────' || chr(10) ||
             '👤 ' || COALESCE(v_rec.name, 'Ambassadeur') || chr(10) ||
             '🏅 Niveau : *' || initcap(v_rec.level) || '*' || chr(10) ||
             '💰 Commissions totales : *' || round(v_rec.total_earned) || ' FCFA*' || chr(10) ||
             '👥 Filleuls actifs : ' || v_rec.total_referrals || chr(10) ||
             '📈 Taux de commission : ' || round(v_rec.commission_rate * 100) || '%' || chr(10) || chr(10) ||
             '💳 Votre reversement sera effectué par Wave/OM dans les 5 jours ouvrés.' || chr(10) ||
             '🔗 Votre lien parrainage : nexus.sn/?ref=' || v_rec.code;
    PERFORM nexus_send_whatsapp(v_rec.phone, v_msg, 'commission_report', v_rec.user_id,
      jsonb_build_object('month', p_month, 'earned', v_rec.total_earned));
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$function$;


-- ============================================================================
-- SECTION B — Figer search_path sur TOUTES les fonctions SECURITY DEFINER
--   du schéma public qui ne l'ont pas (lint function_search_path_mutable, 67 fn).
--   Idempotent, sûr, couvre aussi les futures fonctions.
-- ============================================================================
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef
      AND NOT EXISTS (SELECT 1 FROM unnest(COALESCE(p.proconfig, '{}')) c WHERE c LIKE 'search_path=%')
  LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path = %L', r.sig, 'public');
  END LOOP;
END $$;


-- ============================================================================
-- SECTION C — Policies d'écriture publiques (lint rls_policy_always_true)
-- ============================================================================

-- C1. SÛR (client=0) — stock_history : écriture serveur/trigger uniquement.
DROP POLICY IF EXISTS stock_history_service_insert ON public.stock_history;
CREATE POLICY stock_history_service_insert ON public.stock_history
  FOR INSERT TO service_role WITH CHECK (true);

-- C2. SÛR — public_chat_reactions : retirer le DELETE public (USING true = suppression
--     des réactions de n'importe qui). Réactions non supprimables côté client.
DROP POLICY IF EXISTS chat_reactions_delete ON public.public_chat_reactions;

-- C3. ⚠️ VÉRIFIER (client insère, doit poser owner=auth.uid()) — scoper à l'auteur.
--     Tester en staging : si le client ne renseigne pas la colonne = auth.uid(),
--     l'INSERT sera rejeté. Décommenter après validation.
-- ALTER POLICY troc_insert_any        ON public.troc_listings   WITH CHECK (auth.uid() = owner_id);
-- ALTER POLICY vendor_ref_insert_auth ON public.vendor_referrals WITH CHECK (auth.uid() = vendor_id);
-- ALTER POLICY audit_logs_insert      ON public.audit_logs       WITH CHECK (auth.uid() = user_id);
-- ALTER POLICY ae_public_insert       ON public.annonces_express  WITH CHECK (auth.uid() IS NOT NULL);
-- ALTER POLICY troc_prop_insert_any   ON public.troc_proposals    WITH CHECK (auth.uid() IS NOT NULL);

-- C4. Analytics anonymes conservées PAR DESIGN (faible nuisance : compteurs gonflés) :
--     affiliate_clicks, product_views, search_logs, newsletter_subscribers.
--     → si fraude constatée, ajouter un rate-limit applicatif plutôt que bloquer.


-- ============================================================================
-- SECTION D — Vues SECURITY DEFINER → security_invoker (gardent leur filtre
--   is_admin() interne, déjà vérifié). Supprime aussi l'ERROR auth_users_exposed.
--   ⚠️ Tester l'affichage admin après bascule (RLS sous-jacente s'applique alors).
-- ============================================================================
-- ALTER VIEW public.payout_requests_admin SET (security_invoker = on);
-- ALTER VIEW public.pending_vendors       SET (security_invoker = on);
-- ALTER VIEW public.pending_approvals      SET (security_invoker = on);
-- ALTER VIEW public.b2b_buyers_admin       SET (security_invoker = on);
-- ALTER VIEW public.v_buyer_pro_admin      SET (security_invoker = on);
-- ALTER VIEW public.v_invoices_summary     SET (security_invoker = on);
-- ALTER VIEW public.vendor_daily_metrics   SET (security_invoker = on);
-- ALTER VIEW public.insurance_leads_kpi    SET (security_invoker = on);


-- ============================================================================
-- SECTION E — Nettoyage / vestiges (auth custom abandonnée — Supabase gère
--   resets & refresh tokens). Vérifier 0 dépendance avant DROP.
-- ============================================================================
-- DROP TABLE IF EXISTS public.password_reset;
-- DROP TABLE IF EXISTS public.password_resets;
-- DROP TABLE IF EXISTS public.token_blacklist;
-- ALTER TABLE public.profiles DROP COLUMN IF EXISTS password_hash;  -- (si non fait au Tier 1)


-- ============================================================================
-- SECTION F — À faire HORS SQL (dashboard) :
--   * Storage : bucket `nexus-stories` → désactiver le listing public anonyme.
--   * Auth : activer « Leaked password protection » (HaveIBeenPwned).
--   * Extensions pg_trgm / unaccent / pg_net → déplacer vers le schéma `extensions`
--     (CREATE EXTENSION ... SET SCHEMA extensions ; tester la recherche full-text).
-- ============================================================================
