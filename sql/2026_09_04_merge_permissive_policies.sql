-- ════════════════════════════════════════════════════════════════════════════
--  Consolidation des policies RLS PERMISSIVE redondantes
--  (lint `multiple_permissive_policies`, get_advisors 2026-09-04 — cf. JOURNAL.md).
--
--  Portée : les 42 tables où le rôle-cible (`roles`) était IDENTIQUE entre
--  toutes les policies PERMISSIVE en conflit (fusion mathématiquement
--  équivalente : Postgres évalue déjà plusieurs policies permissives en OR,
--  donc les fusionner en UNE policy avec la condition (A OR B OR ...) ne
--  change AUCUNE ligne visible/autorisée — juste le plan d'exécution
--  (1 évaluation au lieu de N par ligne).
--
--  Règle appliquée pour les policies FOR ALL sans WITH CHECK explicite :
--  Postgres réutilise la clause USING comme WITH CHECK par défaut
--  (comportement documenté : https://www.postgresql.org/docs/current/sql-createpolicy.html)
--  — rendue explicite ici lors de l'expansion en policies par action.
--
--  Généré à partir d'un algorithme de composantes connexes (deux policies
--  d'une même table sont fusionnées si elles couvrent au moins une action en
--  commun, en tenant compte des policies FOR ALL qui couvrent les 4 actions)
--  appliqué aux policies extraites de pg_policies. Chaque nouvelle policy
--  documente dans un commentaire les policies sources dont elle hérite la
--  condition, pour audit.
--
--  ⚠️ 18 tables restantes (rôle-cible différent entre policies en conflit —
--  ex. authenticated vs service_role vs public — ou table de stockage
--  `nexus-images`) sont LAISSÉES DE CÔTÉ ici : fusion possible mais
--  nécessitant une relecture individuelle (voir JOURNAL.md pour la liste).
--
--  Idempotent (DROP IF EXISTS + CREATE) mais PAS rejouable au sens strict
--  après un 2e passage modifiant encore ces policies — à app­liquer une fois.
-- ════════════════════════════════════════════════════════════════════════════

-- ── ad_campaigns (src: ads_admin_all, ads_insert_pending, ads_public_active) ──
DROP POLICY IF EXISTS "ads_admin_all" ON public.ad_campaigns;
DROP POLICY IF EXISTS "ads_insert_pending" ON public.ad_campaigns;
DROP POLICY IF EXISTS "ads_public_active" ON public.ad_campaigns;
CREATE POLICY "ad_campaigns_select_merged" ON public.ad_campaigns
  FOR SELECT
  USING ((((status = 'active'::text) AND (payment_status = 'paid'::text) AND (starts_at <= now()) AND (ends_at >= now()))) OR (is_admin()));
CREATE POLICY "ad_campaigns_insert_merged" ON public.ad_campaigns
  FOR INSERT
  WITH CHECK ((((COALESCE(status, 'pending'::text) = 'pending'::text) AND (COALESCE(payment_status, 'pending'::text) = 'pending'::text))) OR (is_admin()));
CREATE POLICY "ad_campaigns_update_merged" ON public.ad_campaigns
  FOR UPDATE
  USING (is_admin())
  WITH CHECK (is_admin());
CREATE POLICY "ad_campaigns_delete_merged" ON public.ad_campaigns
  FOR DELETE
  USING (is_admin());

-- ── ambassador_referrals (src: amb_ref_admin_all, amb_ref_insert_self, amb_ref_select_own, amb_ref_update_self) ──
DROP POLICY IF EXISTS "amb_ref_admin_all" ON public.ambassador_referrals;
DROP POLICY IF EXISTS "amb_ref_insert_self" ON public.ambassador_referrals;
DROP POLICY IF EXISTS "amb_ref_select_own" ON public.ambassador_referrals;
DROP POLICY IF EXISTS "amb_ref_update_self" ON public.ambassador_referrals;
CREATE POLICY "ambassador_referrals_select_merged" ON public.ambassador_referrals
  FOR SELECT
  USING ((((ambassador_id IN ( SELECT ambassadors.id FROM ambassadors WHERE (ambassadors.user_id = ( SELECT auth.uid())))) OR (( SELECT auth.uid()) = referred_user_id))) OR (is_admin()));
CREATE POLICY "ambassador_referrals_insert_merged" ON public.ambassador_referrals
  FOR INSERT
  WITH CHECK (((referred_user_id = ( SELECT auth.uid()))) OR (is_admin()));
CREATE POLICY "ambassador_referrals_update_merged" ON public.ambassador_referrals
  FOR UPDATE
  USING (((referred_user_id = ( SELECT auth.uid()))) OR (is_admin()))
  WITH CHECK (((referred_user_id = ( SELECT auth.uid()))) OR (is_admin()));
CREATE POLICY "ambassador_referrals_delete_merged" ON public.ambassador_referrals
  FOR DELETE
  USING (is_admin());

-- ── ambassadors (src: amb_admin_all, amb_insert_own, amb_public_read, amb_update_own) ──
DROP POLICY IF EXISTS "amb_admin_all" ON public.ambassadors;
DROP POLICY IF EXISTS "amb_insert_own" ON public.ambassadors;
DROP POLICY IF EXISTS "amb_public_read" ON public.ambassadors;
DROP POLICY IF EXISTS "amb_update_own" ON public.ambassadors;
CREATE POLICY "ambassadors_select_merged" ON public.ambassadors
  FOR SELECT
  USING ((((status = 'active'::text) OR (( SELECT auth.uid()) = user_id))) OR (is_admin()));
CREATE POLICY "ambassadors_insert_merged" ON public.ambassadors
  FOR INSERT
  WITH CHECK ((((( SELECT auth.uid()) = user_id))) OR (is_admin()));
CREATE POLICY "ambassadors_update_merged" ON public.ambassadors
  FOR UPDATE
  USING ((((( SELECT auth.uid()) = user_id))) OR (is_admin()))
  WITH CHECK ((((( SELECT auth.uid()) = user_id))) OR (is_admin()));
CREATE POLICY "ambassadors_delete_merged" ON public.ambassadors
  FOR DELETE
  USING (is_admin());

-- ── annonces_express (src: ae_admin_all, ae_public_insert, ae_public_read) ──
DROP POLICY IF EXISTS "ae_admin_all" ON public.annonces_express;
DROP POLICY IF EXISTS "ae_public_insert" ON public.annonces_express;
DROP POLICY IF EXISTS "ae_public_read" ON public.annonces_express;
CREATE POLICY "annonces_express_select_merged" ON public.annonces_express
  FOR SELECT
  USING ((((status = 'active'::text) AND (expires_at > now()))) OR (is_admin()));
CREATE POLICY "annonces_express_insert_merged" ON public.annonces_express
  FOR INSERT
  WITH CHECK ((is_admin()) OR (true));
CREATE POLICY "annonces_express_update_merged" ON public.annonces_express
  FOR UPDATE
  USING (is_admin())
  WITH CHECK (is_admin());
CREATE POLICY "annonces_express_delete_merged" ON public.annonces_express
  FOR DELETE
  USING (is_admin());

-- ── api_subscriptions (src: apisub_admin_all, apisub_insert_pending, apisub_own) ──
DROP POLICY IF EXISTS "apisub_admin_all" ON public.api_subscriptions;
DROP POLICY IF EXISTS "apisub_insert_pending" ON public.api_subscriptions;
DROP POLICY IF EXISTS "apisub_own" ON public.api_subscriptions;
CREATE POLICY "api_subscriptions_select_merged" ON public.api_subscriptions
  FOR SELECT
  USING ((((( SELECT auth.uid()) = user_id))) OR (is_admin()));
CREATE POLICY "api_subscriptions_insert_merged" ON public.api_subscriptions
  FOR INSERT
  WITH CHECK ((((COALESCE(status, 'pending'::text) = 'pending'::text) AND (COALESCE(payment_status, 'pending'::text) = 'pending'::text))) OR (is_admin()));
CREATE POLICY "api_subscriptions_update_merged" ON public.api_subscriptions
  FOR UPDATE
  USING (is_admin())
  WITH CHECK (is_admin());
CREATE POLICY "api_subscriptions_delete_merged" ON public.api_subscriptions
  FOR DELETE
  USING (is_admin());

-- ── app_config (src: app_config_admin_all, app_config_auth_select_safe) ──
DROP POLICY IF EXISTS "app_config_admin_all" ON public.app_config;
DROP POLICY IF EXISTS "app_config_auth_select_safe" ON public.app_config;
CREATE POLICY "app_config_select_merged" ON public.app_config
  FOR SELECT
  USING (((((( SELECT auth.role()) = 'authenticated'::text) AND (key <> ALL (ARRAY['nexus_main_config'::text, 'nexus_wa_cfg'::text]))) OR (key = 'nexus_admin_banners'::text) OR (key = 'nexus_monetization_cfg'::text) OR (key = 'nexus_org_cfg'::text))) OR ((is_admin() OR (( SELECT auth.role()) = 'service_role'::text))));
CREATE POLICY "app_config_insert_merged" ON public.app_config
  FOR INSERT
  WITH CHECK (is_admin() OR (( SELECT auth.role()) = 'service_role'::text));
CREATE POLICY "app_config_update_merged" ON public.app_config
  FOR UPDATE
  USING (is_admin() OR (( SELECT auth.role()) = 'service_role'::text))
  WITH CHECK (is_admin() OR (( SELECT auth.role()) = 'service_role'::text));
CREATE POLICY "app_config_delete_merged" ON public.app_config
  FOR DELETE
  USING (is_admin() OR (( SELECT auth.role()) = 'service_role'::text));

-- ── b2b_buyers (src: b2b_admin_all, b2b_buyer_insert_own, b2b_buyer_select_own, b2b_buyer_update_own) ──
DROP POLICY IF EXISTS "b2b_admin_all" ON public.b2b_buyers;
DROP POLICY IF EXISTS "b2b_buyer_insert_own" ON public.b2b_buyers;
DROP POLICY IF EXISTS "b2b_buyer_select_own" ON public.b2b_buyers;
DROP POLICY IF EXISTS "b2b_buyer_update_own" ON public.b2b_buyers;
CREATE POLICY "b2b_buyers_select_merged" ON public.b2b_buyers
  FOR SELECT
  USING ((((( SELECT auth.uid()) = user_id))) OR (is_admin()));
CREATE POLICY "b2b_buyers_insert_merged" ON public.b2b_buyers
  FOR INSERT
  WITH CHECK ((((( SELECT auth.uid()) = user_id))) OR (is_admin()));
CREATE POLICY "b2b_buyers_update_merged" ON public.b2b_buyers
  FOR UPDATE
  USING ((((( SELECT auth.uid()) = user_id))) OR (is_admin()))
  WITH CHECK ((((( SELECT auth.uid()) = user_id))) OR (is_admin()));
CREATE POLICY "b2b_buyers_delete_merged" ON public.b2b_buyers
  FOR DELETE
  USING (is_admin());

-- ── b2b_quotes (src: b2b_quotes_admin, b2b_quotes_vendor) ──
DROP POLICY IF EXISTS "b2b_quotes_admin" ON public.b2b_quotes;
DROP POLICY IF EXISTS "b2b_quotes_vendor" ON public.b2b_quotes;
CREATE POLICY "b2b_quotes_select_merged" ON public.b2b_quotes
  FOR SELECT
  USING ((((( SELECT auth.uid()) = vendor_id))) OR ((is_admin() OR (( SELECT auth.uid()) = buyer_id))));
CREATE POLICY "b2b_quotes_insert_merged" ON public.b2b_quotes
  FOR INSERT
  WITH CHECK (is_admin() OR (( SELECT auth.uid()) = buyer_id));
CREATE POLICY "b2b_quotes_update_merged" ON public.b2b_quotes
  FOR UPDATE
  USING (is_admin() OR (( SELECT auth.uid()) = buyer_id))
  WITH CHECK (is_admin() OR (( SELECT auth.uid()) = buyer_id));
CREATE POLICY "b2b_quotes_delete_merged" ON public.b2b_quotes
  FOR DELETE
  USING (is_admin() OR (( SELECT auth.uid()) = buyer_id));

-- ── buyer_requests (src: buyer_requests_admin, buyer_insert_request, buyer_requests_select, buyer_requests_update_own) ──
DROP POLICY IF EXISTS "buyer_requests_admin" ON public.buyer_requests;
DROP POLICY IF EXISTS "buyer_insert_request" ON public.buyer_requests;
DROP POLICY IF EXISTS "buyer_requests_select" ON public.buyer_requests;
DROP POLICY IF EXISTS "buyer_requests_update_own" ON public.buyer_requests;
CREATE POLICY "buyer_requests_select_merged" ON public.buyer_requests
  FOR SELECT
  USING ((((COALESCE(status, 'open'::text) = 'open'::text) OR (buyer_id = ( SELECT auth.uid())) OR ((is_public = true) OR (( SELECT auth.uid()) = buyer_id)))) OR ((auth_user_role() = 'admin'::text)));
CREATE POLICY "buyer_requests_insert_merged" ON public.buyer_requests
  FOR INSERT
  WITH CHECK ((((( SELECT auth.uid()) = buyer_id) OR (buyer_id = ( SELECT auth.uid())))) OR ((auth_user_role() = 'admin'::text)));
CREATE POLICY "buyer_requests_update_merged" ON public.buyer_requests
  FOR UPDATE
  USING (((( buyer_id = ( SELECT auth.uid())) OR (( SELECT auth.uid()) = buyer_id))) OR ((auth_user_role() = 'admin'::text)))
  WITH CHECK (((( buyer_id = ( SELECT auth.uid())) OR (( SELECT auth.uid()) = buyer_id))) OR ((auth_user_role() = 'admin'::text)));
CREATE POLICY "buyer_requests_delete_merged" ON public.buyer_requests
  FOR DELETE
  USING (auth_user_role() = 'admin'::text);

-- ── courier_earnings (src: earn_admin_all, earn_courier_own) ──
DROP POLICY IF EXISTS "earn_admin_all" ON public.courier_earnings;
DROP POLICY IF EXISTS "earn_courier_own" ON public.courier_earnings;
CREATE POLICY "courier_earnings_select_merged" ON public.courier_earnings
  FOR SELECT
  USING (((courier_id IN ( SELECT couriers.id FROM couriers WHERE (couriers.user_id = ( SELECT auth.uid()))))) OR (is_admin()));
CREATE POLICY "courier_earnings_insert_merged" ON public.courier_earnings
  FOR INSERT
  WITH CHECK (is_admin());
CREATE POLICY "courier_earnings_update_merged" ON public.courier_earnings
  FOR UPDATE
  USING (is_admin())
  WITH CHECK (is_admin());
CREATE POLICY "courier_earnings_delete_merged" ON public.courier_earnings
  FOR DELETE
  USING (is_admin());

-- ── couriers (src: couriers_admin_all, couriers_self_insert, couriers_public_read, couriers_self_update) ──
DROP POLICY IF EXISTS "couriers_admin_all" ON public.couriers;
DROP POLICY IF EXISTS "couriers_self_insert" ON public.couriers;
DROP POLICY IF EXISTS "couriers_public_read" ON public.couriers;
DROP POLICY IF EXISTS "couriers_self_update" ON public.couriers;
CREATE POLICY "couriers_select_merged" ON public.couriers
  FOR SELECT
  USING ((((status = 'active'::text) OR (user_id = ( SELECT auth.uid())))) OR ((is_admin() OR (( SELECT auth.uid()) = user_id) OR ((user_id = ( SELECT auth.uid())) OR (EXISTS ( SELECT 1 FROM profiles p WHERE ((p.id = ( SELECT auth.uid())) AND (p.role = 'admin'::text))))))));
CREATE POLICY "couriers_insert_merged" ON public.couriers
  FOR INSERT
  WITH CHECK (((is_admin() OR (( SELECT auth.uid()) = user_id) OR ((user_id = ( SELECT auth.uid())) OR (EXISTS ( SELECT 1 FROM profiles p WHERE ((p.id = ( SELECT auth.uid())) AND (p.role = 'admin'::text))))))) OR ((user_id = ( SELECT auth.uid()))));
CREATE POLICY "couriers_update_merged" ON public.couriers
  FOR UPDATE
  USING (((is_admin() OR (( SELECT auth.uid()) = user_id) OR ((user_id = ( SELECT auth.uid())) OR (EXISTS ( SELECT 1 FROM profiles p WHERE ((p.id = ( SELECT auth.uid())) AND (p.role = 'admin'::text))))))) OR ((user_id = ( SELECT auth.uid()))))
  WITH CHECK (((is_admin() OR (( SELECT auth.uid()) = user_id) OR ((user_id = ( SELECT auth.uid())) OR (EXISTS ( SELECT 1 FROM profiles p WHERE ((p.id = ( SELECT auth.uid())) AND (p.role = 'admin'::text))))))) OR ((user_id = ( SELECT auth.uid()))));
CREATE POLICY "couriers_delete_merged" ON public.couriers
  FOR DELETE
  USING (is_admin() OR (( SELECT auth.uid()) = user_id) OR ((user_id = ( SELECT auth.uid())) OR (EXISTS ( SELECT 1 FROM profiles p WHERE ((p.id = ( SELECT auth.uid())) AND (p.role = 'admin'::text))))));

-- ── delivery_requests (src: dr_admin_all, dr_pending_view) ──
DROP POLICY IF EXISTS "dr_admin_all" ON public.delivery_requests;
DROP POLICY IF EXISTS "dr_pending_view" ON public.delivery_requests;
CREATE POLICY "delivery_requests_select_merged" ON public.delivery_requests
  FOR SELECT
  USING ((((status = 'pending'::text) AND (delivery_city IN ( SELECT unnest(couriers.zones) AS unnest FROM couriers WHERE ((couriers.user_id = ( SELECT auth.uid())) AND (couriers.status = 'active'::text)))))) OR ((is_admin() OR (courier_id IN ( SELECT couriers.id FROM couriers WHERE (couriers.user_id = ( SELECT auth.uid())))))));
CREATE POLICY "delivery_requests_insert_merged" ON public.delivery_requests
  FOR INSERT
  WITH CHECK (is_admin() OR (courier_id IN ( SELECT couriers.id FROM couriers WHERE (couriers.user_id = ( SELECT auth.uid())))));
CREATE POLICY "delivery_requests_update_merged" ON public.delivery_requests
  FOR UPDATE
  USING (is_admin() OR (courier_id IN ( SELECT couriers.id FROM couriers WHERE (couriers.user_id = ( SELECT auth.uid())))))
  WITH CHECK (is_admin() OR (courier_id IN ( SELECT couriers.id FROM couriers WHERE (couriers.user_id = ( SELECT auth.uid())))));
CREATE POLICY "delivery_requests_delete_merged" ON public.delivery_requests
  FOR DELETE
  USING (is_admin() OR (courier_id IN ( SELECT couriers.id FROM couriers WHERE (couriers.user_id = ( SELECT auth.uid())))));

-- ── flash_sales (src: flash_admin_all, flash_vendor_insert, flash_public_read, flash_vendor_disable) ──
DROP POLICY IF EXISTS "flash_admin_all" ON public.flash_sales;
DROP POLICY IF EXISTS "flash_vendor_insert" ON public.flash_sales;
DROP POLICY IF EXISTS "flash_public_read" ON public.flash_sales;
DROP POLICY IF EXISTS "flash_vendor_disable" ON public.flash_sales;
CREATE POLICY "flash_sales_select_merged" ON public.flash_sales
  FOR SELECT
  USING ((is_admin()) OR (true));
CREATE POLICY "flash_sales_insert_merged" ON public.flash_sales
  FOR INSERT
  WITH CHECK ((((( SELECT auth.uid()) = vendor_id) AND (active = false))) OR (is_admin()));
CREATE POLICY "flash_sales_update_merged" ON public.flash_sales
  FOR UPDATE
  USING ((((( SELECT auth.uid()) = vendor_id))) OR (is_admin()))
  WITH CHECK ((((( SELECT auth.uid()) = vendor_id) AND (active = false))) OR (is_admin()));
CREATE POLICY "flash_sales_delete_merged" ON public.flash_sales
  FOR DELETE
  USING (is_admin());

-- ── insurance_leads (src: ins_admin_all, ins_buyer_insert, ins_buyer_select) ──
DROP POLICY IF EXISTS "ins_admin_all" ON public.insurance_leads;
DROP POLICY IF EXISTS "ins_buyer_insert" ON public.insurance_leads;
DROP POLICY IF EXISTS "ins_buyer_select" ON public.insurance_leads;
CREATE POLICY "insurance_leads_select_merged" ON public.insurance_leads
  FOR SELECT
  USING ((((( SELECT auth.uid()) = buyer_id))) OR (is_admin()));
CREATE POLICY "insurance_leads_insert_merged" ON public.insurance_leads
  FOR INSERT
  WITH CHECK ((((( SELECT auth.uid()) = buyer_id) OR (buyer_id IS NULL))) OR (is_admin()));
CREATE POLICY "insurance_leads_update_merged" ON public.insurance_leads
  FOR UPDATE
  USING (is_admin())
  WITH CHECK (is_admin());
CREATE POLICY "insurance_leads_delete_merged" ON public.insurance_leads
  FOR DELETE
  USING (is_admin());

-- ── live_sessions (src: vendor_manage_lives, public_read_lives) ──
DROP POLICY IF EXISTS "vendor_manage_lives" ON public.live_sessions;
DROP POLICY IF EXISTS "public_read_lives" ON public.live_sessions;
CREATE POLICY "live_sessions_select_merged" ON public.live_sessions
  FOR SELECT
  USING ((((( SELECT auth.uid()) = vendor_id))) OR (true));
CREATE POLICY "live_sessions_insert_merged" ON public.live_sessions
  FOR INSERT
  WITH CHECK (( SELECT auth.uid()) = vendor_id);
CREATE POLICY "live_sessions_update_merged" ON public.live_sessions
  FOR UPDATE
  USING (( SELECT auth.uid()) = vendor_id)
  WITH CHECK (( SELECT auth.uid()) = vendor_id);
CREATE POLICY "live_sessions_delete_merged" ON public.live_sessions
  FOR DELETE
  USING (( SELECT auth.uid()) = vendor_id);

-- ── loyalty_rewards (src: loyalty_rewards_admin_write, loyalty_rewards_admin_read_all) ──
DROP POLICY IF EXISTS "loyalty_rewards_admin_write" ON public.loyalty_rewards;
DROP POLICY IF EXISTS "loyalty_rewards_admin_read_all" ON public.loyalty_rewards;
CREATE POLICY "loyalty_rewards_select_merged" ON public.loyalty_rewards
  FOR SELECT
  USING (((EXISTS ( SELECT 1 FROM profiles WHERE ((profiles.id = ( SELECT auth.uid())) AND (profiles.role = 'admin'::text)))) OR ((active = true) AND ((expires_at IS NULL) OR (expires_at > now())))));
CREATE POLICY "loyalty_rewards_insert_merged" ON public.loyalty_rewards
  FOR INSERT
  WITH CHECK (EXISTS ( SELECT 1 FROM profiles WHERE ((profiles.id = ( SELECT auth.uid())) AND (profiles.role = 'admin'::text))));
CREATE POLICY "loyalty_rewards_update_merged" ON public.loyalty_rewards
  FOR UPDATE
  USING (EXISTS ( SELECT 1 FROM profiles WHERE ((profiles.id = ( SELECT auth.uid())) AND (profiles.role = 'admin'::text))))
  WITH CHECK (EXISTS ( SELECT 1 FROM profiles WHERE ((profiles.id = ( SELECT auth.uid())) AND (profiles.role = 'admin'::text))));
CREATE POLICY "loyalty_rewards_delete_merged" ON public.loyalty_rewards
  FOR DELETE
  USING (EXISTS ( SELECT 1 FROM profiles WHERE ((profiles.id = ( SELECT auth.uid())) AND (profiles.role = 'admin'::text))));

-- ── maintenance_log (src: ml_service_all, ml_admin_read) — remplace le fix ponctuel du 2026-09-04 ──
DROP POLICY IF EXISTS "ml_service_all" ON public.maintenance_log;
DROP POLICY IF EXISTS "ml_admin_read" ON public.maintenance_log;
CREATE POLICY "maintenance_log_select_merged" ON public.maintenance_log
  FOR SELECT
  USING (((((( SELECT current_setting('request.jwt.claims'::text, true)))::jsonb ->> 'role'::text) = 'service_role'::text)) OR ((EXISTS ( SELECT 1 FROM profiles WHERE ((profiles.id = ( SELECT auth.uid())) AND (profiles.role = 'admin'::text))))));
CREATE POLICY "maintenance_log_insert_merged" ON public.maintenance_log
  FOR INSERT
  WITH CHECK (((( SELECT current_setting('request.jwt.claims'::text, true)))::jsonb ->> 'role'::text) = 'service_role'::text);
CREATE POLICY "maintenance_log_update_merged" ON public.maintenance_log
  FOR UPDATE
  USING (((( SELECT current_setting('request.jwt.claims'::text, true)))::jsonb ->> 'role'::text) = 'service_role'::text)
  WITH CHECK (((( SELECT current_setting('request.jwt.claims'::text, true)))::jsonb ->> 'role'::text) = 'service_role'::text);
CREATE POLICY "maintenance_log_delete_merged" ON public.maintenance_log
  FOR DELETE
  USING (((( SELECT current_setting('request.jwt.claims'::text, true)))::jsonb ->> 'role'::text) = 'service_role'::text);

-- ── offers (src: offers_own, buyer_creates_offers, buyer_sees_own_offers, vendor_updates_offers) ──
DROP POLICY IF EXISTS "offers_own" ON public.offers;
DROP POLICY IF EXISTS "buyer_creates_offers" ON public.offers;
DROP POLICY IF EXISTS "buyer_sees_own_offers" ON public.offers;
DROP POLICY IF EXISTS "vendor_updates_offers" ON public.offers;
CREATE POLICY "offers_select_merged" ON public.offers
  FOR SELECT
  USING ((((( SELECT auth.uid()) = buyer_id) OR (( SELECT auth.uid()) = vendor_id))) OR (((buyer_id = ( SELECT auth.uid())) OR (vendor_id = ( SELECT auth.uid())))));
CREATE POLICY "offers_insert_merged" ON public.offers
  FOR INSERT
  WITH CHECK ((((( SELECT auth.uid()) = buyer_id) OR (( SELECT auth.uid()) = vendor_id))) OR ((buyer_id = ( SELECT auth.uid()))));
CREATE POLICY "offers_update_merged" ON public.offers
  FOR UPDATE
  USING ((((( SELECT auth.uid()) = buyer_id) OR (( SELECT auth.uid()) = vendor_id))) OR ((vendor_id = ( SELECT auth.uid()))))
  WITH CHECK ((((( SELECT auth.uid()) = buyer_id) OR (( SELECT auth.uid()) = vendor_id))) OR ((vendor_id = ( SELECT auth.uid()))));
CREATE POLICY "offers_delete_merged" ON public.offers
  FOR DELETE
  USING ((( SELECT auth.uid()) = buyer_id) OR (( SELECT auth.uid()) = vendor_id));

-- ── orders (src: orders_admin_all_fixed, orders_insert_buyer, orders_select_own_buyer, orders_update_buyer_cancel_only) ──
DROP POLICY IF EXISTS "orders_admin_all_fixed" ON public.orders;
DROP POLICY IF EXISTS "orders_insert_buyer" ON public.orders;
DROP POLICY IF EXISTS "orders_select_own_buyer" ON public.orders;
DROP POLICY IF EXISTS "orders_update_buyer_cancel_only" ON public.orders;
CREATE POLICY "orders_select_merged" ON public.orders
  FOR SELECT
  USING ((((( SELECT auth.uid()) = buyer_id) OR (( SELECT auth.uid()) = vendor_id))) OR ((auth_user_role() = 'admin'::text)));
CREATE POLICY "orders_insert_merged" ON public.orders
  FOR INSERT
  WITH CHECK (((( SELECT auth.uid()) = buyer_id)) OR ((auth_user_role() = 'admin'::text)));
CREATE POLICY "orders_update_merged" ON public.orders
  FOR UPDATE
  USING (((((( SELECT auth.uid()) = buyer_id) AND (status = ANY (ARRAY['pending'::text, 'processing'::text]))) OR ((( SELECT auth.uid()) = vendor_id) OR (EXISTS ( SELECT 1 FROM profiles p WHERE ((p.id = ( SELECT auth.uid())) AND (p.role = 'admin'::text))))))) OR ((auth_user_role() = 'admin'::text)))
  WITH CHECK (((((( SELECT auth.uid()) = buyer_id) AND (status = 'cancelled'::text)) OR ((( SELECT auth.uid()) = vendor_id) OR (EXISTS ( SELECT 1 FROM profiles p WHERE ((p.id = ( SELECT auth.uid())) AND (p.role = 'admin'::text))))))) OR ((auth_user_role() = 'admin'::text)));
CREATE POLICY "orders_delete_merged" ON public.orders
  FOR DELETE
  USING (auth_user_role() = 'admin'::text);

-- ── pro_reviews (src: pro_reviews_admin_all, pro_reviews_select_public) ──
DROP POLICY IF EXISTS "pro_reviews_admin_all" ON public.pro_reviews;
DROP POLICY IF EXISTS "pro_reviews_select_public" ON public.pro_reviews;
CREATE POLICY "pro_reviews_select_merged" ON public.pro_reviews
  FOR SELECT
  USING ((((( SELECT profiles.role FROM profiles WHERE (profiles.id = ( SELECT auth.uid()))) = 'admin'::text) OR (user_id = ( SELECT auth.uid())))) OR (true));
CREATE POLICY "pro_reviews_insert_merged" ON public.pro_reviews
  FOR INSERT
  WITH CHECK ((( SELECT profiles.role FROM profiles WHERE (profiles.id = ( SELECT auth.uid()))) = 'admin'::text) OR (user_id = ( SELECT auth.uid())));
CREATE POLICY "pro_reviews_update_merged" ON public.pro_reviews
  FOR UPDATE
  USING ((( SELECT profiles.role FROM profiles WHERE (profiles.id = ( SELECT auth.uid()))) = 'admin'::text) OR (user_id = ( SELECT auth.uid())))
  WITH CHECK ((( SELECT profiles.role FROM profiles WHERE (profiles.id = ( SELECT auth.uid()))) = 'admin'::text) OR (user_id = ( SELECT auth.uid())));
CREATE POLICY "pro_reviews_delete_merged" ON public.pro_reviews
  FOR DELETE
  USING ((( SELECT profiles.role FROM profiles WHERE (profiles.id = ( SELECT auth.uid()))) = 'admin'::text) OR (user_id = ( SELECT auth.uid())));

-- ── product_boosts (src: boosts_admin_all, boosts_vendor_insert, boosts_public_read) ──
DROP POLICY IF EXISTS "boosts_admin_all" ON public.product_boosts;
DROP POLICY IF EXISTS "boosts_vendor_insert" ON public.product_boosts;
DROP POLICY IF EXISTS "boosts_public_read" ON public.product_boosts;
CREATE POLICY "product_boosts_select_merged" ON public.product_boosts
  FOR SELECT
  USING ((((active = true) AND (ends_at > now())) OR ((( SELECT auth.uid()) = vendor_id))) OR (is_admin()));
CREATE POLICY "product_boosts_insert_merged" ON public.product_boosts
  FOR INSERT
  WITH CHECK ((((( SELECT auth.uid()) = vendor_id) AND (active = false))) OR (is_admin()));
CREATE POLICY "product_boosts_update_merged" ON public.product_boosts
  FOR UPDATE
  USING (is_admin())
  WITH CHECK (is_admin());
CREATE POLICY "product_boosts_delete_merged" ON public.product_boosts
  FOR DELETE
  USING (is_admin());

-- ── product_questions (src: admin_all_questions, auth_create_questions, questions_public_read, vendor_answers_question) ──
DROP POLICY IF EXISTS "admin_all_questions" ON public.product_questions;
DROP POLICY IF EXISTS "auth_create_questions" ON public.product_questions;
DROP POLICY IF EXISTS "questions_public_read" ON public.product_questions;
DROP POLICY IF EXISTS "vendor_answers_question" ON public.product_questions;
CREATE POLICY "product_questions_select_merged" ON public.product_questions
  FOR SELECT
  USING ((auth_user_role() = 'admin'::text) OR (true));
CREATE POLICY "product_questions_insert_merged" ON public.product_questions
  FOR INSERT
  WITH CHECK ((auth_user_role() = 'admin'::text) OR ((user_id = ( SELECT auth.uid()))));
CREATE POLICY "product_questions_update_merged" ON public.product_questions
  FOR UPDATE
  USING ((auth_user_role() = 'admin'::text) OR ((vendor_id = ( SELECT auth.uid()))))
  WITH CHECK ((auth_user_role() = 'admin'::text) OR ((vendor_id = ( SELECT auth.uid()))));
CREATE POLICY "product_questions_delete_merged" ON public.product_questions
  FOR DELETE
  USING (auth_user_role() = 'admin'::text);

-- ── profiles (src: profiles_admin_all, profiles_insert_own, profiles_commission_vendor_read, profiles_update_own) ──
DROP POLICY IF EXISTS "profiles_admin_all" ON public.profiles;
DROP POLICY IF EXISTS "profiles_insert_own" ON public.profiles;
DROP POLICY IF EXISTS "profiles_commission_vendor_read" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
CREATE POLICY "profiles_select_merged" ON public.profiles
  FOR SELECT
  USING ((((( SELECT auth.uid()) = id) OR ((role = 'vendor'::text) AND (status = 'approved'::text)))) OR ((is_admin() OR (( SELECT auth.role()) = 'service_role'::text))));
CREATE POLICY "profiles_insert_merged" ON public.profiles
  FOR INSERT
  WITH CHECK ((((( SELECT auth.uid()) = id))) OR ((is_admin() OR (( SELECT auth.role()) = 'service_role'::text))));
CREATE POLICY "profiles_update_merged" ON public.profiles
  FOR UPDATE
  USING ((((( SELECT auth.uid()) = id))) OR ((is_admin() OR (( SELECT auth.role()) = 'service_role'::text))))
  WITH CHECK ((((( SELECT auth.uid()) = id))) OR ((is_admin() OR (( SELECT auth.role()) = 'service_role'::text))));
CREATE POLICY "profiles_delete_merged" ON public.profiles
  FOR DELETE
  USING (is_admin() OR (( SELECT auth.role()) = 'service_role'::text));

-- ── pros (src: pros_admin_all, pros_select_public) ──
DROP POLICY IF EXISTS "pros_admin_all" ON public.pros;
DROP POLICY IF EXISTS "pros_select_public" ON public.pros;
CREATE POLICY "pros_select_merged" ON public.pros
  FOR SELECT
  USING ((((( SELECT profiles.role FROM profiles WHERE (profiles.id = ( SELECT auth.uid()))) = 'admin'::text) OR (user_id = ( SELECT auth.uid())))) OR ((status = 'active'::text)));
CREATE POLICY "pros_insert_merged" ON public.pros
  FOR INSERT
  WITH CHECK ((( SELECT profiles.role FROM profiles WHERE (profiles.id = ( SELECT auth.uid()))) = 'admin'::text) OR (user_id = ( SELECT auth.uid())));
CREATE POLICY "pros_update_merged" ON public.pros
  FOR UPDATE
  USING ((( SELECT profiles.role FROM profiles WHERE (profiles.id = ( SELECT auth.uid()))) = 'admin'::text) OR (user_id = ( SELECT auth.uid())))
  WITH CHECK ((( SELECT profiles.role FROM profiles WHERE (profiles.id = ( SELECT auth.uid()))) = 'admin'::text) OR (user_id = ( SELECT auth.uid())));
CREATE POLICY "pros_delete_merged" ON public.pros
  FOR DELETE
  USING ((( SELECT profiles.role FROM profiles WHERE (profiles.id = ( SELECT auth.uid()))) = 'admin'::text) OR (user_id = ( SELECT auth.uid())));

-- ── push_subscriptions (src: ps_own, ps_delete_own, ps_insert_own, ps_admin_all) ──
DROP POLICY IF EXISTS "ps_own" ON public.push_subscriptions;
DROP POLICY IF EXISTS "ps_delete_own" ON public.push_subscriptions;
DROP POLICY IF EXISTS "ps_insert_own" ON public.push_subscriptions;
DROP POLICY IF EXISTS "ps_admin_all" ON public.push_subscriptions;
CREATE POLICY "push_subscriptions_select_merged" ON public.push_subscriptions
  FOR SELECT
  USING ((((( SELECT auth.uid()) = user_id))) OR ((is_admin() OR (( SELECT auth.uid()) = user_id))));
CREATE POLICY "push_subscriptions_insert_merged" ON public.push_subscriptions
  FOR INSERT
  WITH CHECK (( SELECT auth.uid()) = user_id);
CREATE POLICY "push_subscriptions_update_merged" ON public.push_subscriptions
  FOR UPDATE
  USING (( SELECT auth.uid()) = user_id)
  WITH CHECK (( SELECT auth.uid()) = user_id);
CREATE POLICY "push_subscriptions_delete_merged" ON public.push_subscriptions
  FOR DELETE
  USING (( SELECT auth.uid()) = user_id);

-- ── quote_requests (src: quote_requests_admin_all, quote_requests_buyer_own, quote_requests_pro_notified) — remplace le fix ponctuel du 2026-09-04 ──
DROP POLICY IF EXISTS "quote_requests_admin_all" ON public.quote_requests;
DROP POLICY IF EXISTS "quote_requests_buyer_own" ON public.quote_requests;
DROP POLICY IF EXISTS "quote_requests_pro_notified" ON public.quote_requests;
CREATE POLICY "quote_requests_select_merged" ON public.quote_requests
  FOR SELECT
  USING ((EXISTS ( SELECT 1 FROM (quote_responses r JOIN pros pr ON ((pr.id = r.pro_id))) WHERE ((r.request_id = quote_requests.id) AND (pr.user_id = ( SELECT auth.uid()))))) OR ((buyer_id = ( SELECT auth.uid()))) OR (is_admin()));
CREATE POLICY "quote_requests_insert_merged" ON public.quote_requests
  FOR INSERT
  WITH CHECK (((buyer_id = ( SELECT auth.uid()))) OR (is_admin()));
CREATE POLICY "quote_requests_update_merged" ON public.quote_requests
  FOR UPDATE
  USING (((buyer_id = ( SELECT auth.uid()))) OR (is_admin()))
  WITH CHECK (((buyer_id = ( SELECT auth.uid()))) OR (is_admin()));
CREATE POLICY "quote_requests_delete_merged" ON public.quote_requests
  FOR DELETE
  USING (((buyer_id = ( SELECT auth.uid()))) OR (is_admin()));

-- ── quote_responses (src: quote_responses_admin_all, quote_responses_pro_own, quote_responses_buyer_read) — remplace le fix ponctuel du 2026-09-04 ──
DROP POLICY IF EXISTS "quote_responses_admin_all" ON public.quote_responses;
DROP POLICY IF EXISTS "quote_responses_pro_own" ON public.quote_responses;
DROP POLICY IF EXISTS "quote_responses_buyer_read" ON public.quote_responses;
CREATE POLICY "quote_responses_select_merged" ON public.quote_responses
  FOR SELECT
  USING ((EXISTS ( SELECT 1 FROM quote_requests q WHERE ((q.id = quote_responses.request_id) AND (q.buyer_id = ( SELECT auth.uid()))))) OR ((pro_id IN ( SELECT pros.id FROM pros WHERE (pros.user_id = ( SELECT auth.uid()))))) OR (is_admin()));
CREATE POLICY "quote_responses_insert_merged" ON public.quote_responses
  FOR INSERT
  WITH CHECK (((pro_id IN ( SELECT pros.id FROM pros WHERE (pros.user_id = ( SELECT auth.uid()))))) OR (is_admin()));
CREATE POLICY "quote_responses_update_merged" ON public.quote_responses
  FOR UPDATE
  USING (((pro_id IN ( SELECT pros.id FROM pros WHERE (pros.user_id = ( SELECT auth.uid()))))) OR (is_admin()))
  WITH CHECK (((pro_id IN ( SELECT pros.id FROM pros WHERE (pros.user_id = ( SELECT auth.uid()))))) OR (is_admin()));
CREATE POLICY "quote_responses_delete_merged" ON public.quote_responses
  FOR DELETE
  USING (((pro_id IN ( SELECT pros.id FROM pros WHERE (pros.user_id = ( SELECT auth.uid()))))) OR (is_admin()));

-- ── rescue_offers (src: rescue_offers_admin_all, rescue_offers_own) ──
DROP POLICY IF EXISTS "rescue_offers_admin_all" ON public.rescue_offers;
DROP POLICY IF EXISTS "rescue_offers_own" ON public.rescue_offers;
CREATE POLICY "rescue_offers_select_merged" ON public.rescue_offers
  FOR SELECT
  USING (((rescuer_id = ( SELECT auth.uid()))) OR (is_admin()));
CREATE POLICY "rescue_offers_insert_merged" ON public.rescue_offers
  FOR INSERT
  WITH CHECK (is_admin());
CREATE POLICY "rescue_offers_update_merged" ON public.rescue_offers
  FOR UPDATE
  USING (is_admin())
  WITH CHECK (is_admin());
CREATE POLICY "rescue_offers_delete_merged" ON public.rescue_offers
  FOR DELETE
  USING (is_admin());

-- ── rescue_requests (src: rescue_req_admin_all, rescue_req_rescuer_assigned, rescue_req_rescuer_update) ──
DROP POLICY IF EXISTS "rescue_req_admin_all" ON public.rescue_requests;
DROP POLICY IF EXISTS "rescue_req_rescuer_assigned" ON public.rescue_requests;
DROP POLICY IF EXISTS "rescue_req_rescuer_update" ON public.rescue_requests;
CREATE POLICY "rescue_requests_select_merged" ON public.rescue_requests
  FOR SELECT
  USING ((is_admin() OR (requester_id = ( SELECT auth.uid()))) OR ((rescuer_id = ( SELECT auth.uid()))));
CREATE POLICY "rescue_requests_insert_merged" ON public.rescue_requests
  FOR INSERT
  WITH CHECK (is_admin() OR (requester_id = ( SELECT auth.uid())));
CREATE POLICY "rescue_requests_update_merged" ON public.rescue_requests
  FOR UPDATE
  USING ((is_admin() OR (requester_id = ( SELECT auth.uid()))) OR ((rescuer_id = ( SELECT auth.uid()))))
  WITH CHECK ((is_admin() OR (requester_id = ( SELECT auth.uid()))) OR ((rescuer_id = ( SELECT auth.uid()))));
CREATE POLICY "rescue_requests_delete_merged" ON public.rescue_requests
  FOR DELETE
  USING (is_admin() OR (requester_id = ( SELECT auth.uid())));

-- ── rescuer_earnings (src: rescuer_earnings_admin_all, rescuer_earnings_own) ──
DROP POLICY IF EXISTS "rescuer_earnings_admin_all" ON public.rescuer_earnings;
DROP POLICY IF EXISTS "rescuer_earnings_own" ON public.rescuer_earnings;
CREATE POLICY "rescuer_earnings_select_merged" ON public.rescuer_earnings
  FOR SELECT
  USING (((rescuer_id IN ( SELECT rescuers.id FROM rescuers WHERE (rescuers.user_id = ( SELECT auth.uid()))))) OR (is_admin()));
CREATE POLICY "rescuer_earnings_insert_merged" ON public.rescuer_earnings
  FOR INSERT
  WITH CHECK (is_admin());
CREATE POLICY "rescuer_earnings_update_merged" ON public.rescuer_earnings
  FOR UPDATE
  USING (is_admin())
  WITH CHECK (is_admin());
CREATE POLICY "rescuer_earnings_delete_merged" ON public.rescuer_earnings
  FOR DELETE
  USING (is_admin());

-- ── rescuers (src: rescuers_admin_all, rescuers_select_public) ──
DROP POLICY IF EXISTS "rescuers_admin_all" ON public.rescuers;
DROP POLICY IF EXISTS "rescuers_select_public" ON public.rescuers;
CREATE POLICY "rescuers_select_merged" ON public.rescuers
  FOR SELECT
  USING (((status = 'active'::text) OR (user_id = ( SELECT auth.uid())) OR is_admin()));
CREATE POLICY "rescuers_insert_merged" ON public.rescuers
  FOR INSERT
  WITH CHECK (is_admin() OR (user_id = ( SELECT auth.uid())));
CREATE POLICY "rescuers_update_merged" ON public.rescuers
  FOR UPDATE
  USING (is_admin() OR (user_id = ( SELECT auth.uid())))
  WITH CHECK (is_admin() OR (user_id = ( SELECT auth.uid())));
CREATE POLICY "rescuers_delete_merged" ON public.rescuers
  FOR DELETE
  USING (is_admin() OR (user_id = ( SELECT auth.uid())));

-- ── return_requests (src: return_admin_all, rr_insert, return_vendor_read, rr_update) ──
DROP POLICY IF EXISTS "return_admin_all" ON public.return_requests;
DROP POLICY IF EXISTS "rr_insert" ON public.return_requests;
DROP POLICY IF EXISTS "return_vendor_read" ON public.return_requests;
DROP POLICY IF EXISTS "rr_update" ON public.return_requests;
CREATE POLICY "return_requests_select_merged" ON public.return_requests
  FOR SELECT
  USING ((((( SELECT auth.uid()) = vendor_id) OR ((( SELECT auth.uid()) = buyer_id) OR (( SELECT auth.uid()) = vendor_id) OR (auth_user_role() = 'admin'::text)))) OR ((is_admin() OR (( SELECT auth.uid()) = buyer_id) OR (auth_user_role() = 'admin'::text))));
CREATE POLICY "return_requests_insert_merged" ON public.return_requests
  FOR INSERT
  WITH CHECK ((((( SELECT auth.uid()) = buyer_id) OR (auth_user_role() = 'admin'::text))) OR ((is_admin() OR (( SELECT auth.uid()) = buyer_id) OR (auth_user_role() = 'admin'::text))));
CREATE POLICY "return_requests_update_merged" ON public.return_requests
  FOR UPDATE
  USING ((((( SELECT auth.uid()) = vendor_id) OR (( SELECT auth.uid()) = buyer_id) OR (auth_user_role() = 'admin'::text))) OR ((is_admin() OR (( SELECT auth.uid()) = buyer_id) OR (auth_user_role() = 'admin'::text))))
  WITH CHECK ((((( SELECT auth.uid()) = vendor_id) OR (( SELECT auth.uid()) = buyer_id) OR (auth_user_role() = 'admin'::text))) OR ((is_admin() OR (( SELECT auth.uid()) = buyer_id) OR (auth_user_role() = 'admin'::text))));
CREATE POLICY "return_requests_delete_merged" ON public.return_requests
  FOR DELETE
  USING (is_admin() OR (( SELECT auth.uid()) = buyer_id) OR (auth_user_role() = 'admin'::text));

-- ── site_popups (src: popups_admin_all, popups_public_read) ──
DROP POLICY IF EXISTS "popups_admin_all" ON public.site_popups;
DROP POLICY IF EXISTS "popups_public_read" ON public.site_popups;
CREATE POLICY "site_popups_select_merged" ON public.site_popups
  FOR SELECT
  USING ((((active = true) AND (starts_at <= now()) AND ((ends_at IS NULL) OR (ends_at >= now()))) OR true) OR (is_admin()));
CREATE POLICY "site_popups_insert_merged" ON public.site_popups
  FOR INSERT
  WITH CHECK (is_admin());
CREATE POLICY "site_popups_update_merged" ON public.site_popups
  FOR UPDATE
  USING (is_admin())
  WITH CHECK (is_admin());
CREATE POLICY "site_popups_delete_merged" ON public.site_popups
  FOR DELETE
  USING (is_admin());

-- ── stories (src: stories_admin_all, stories_delete_own, stories_public_read, stories_update_own) ──
DROP POLICY IF EXISTS "stories_admin_all" ON public.stories;
DROP POLICY IF EXISTS "stories_delete_own" ON public.stories;
DROP POLICY IF EXISTS "stories_public_read" ON public.stories;
DROP POLICY IF EXISTS "stories_update_own" ON public.stories;
CREATE POLICY "stories_select_merged" ON public.stories
  FOR SELECT
  USING ((( SELECT profiles.role FROM profiles WHERE (profiles.id = ( SELECT auth.uid()))) = 'admin'::text) OR ((((status = 'active'::text) AND ((expires_at IS NULL) OR (expires_at > now()))) OR (status = 'closed'::text))));
CREATE POLICY "stories_insert_merged" ON public.stories
  FOR INSERT
  WITH CHECK (( SELECT profiles.role FROM profiles WHERE (profiles.id = ( SELECT auth.uid()))) = 'admin'::text);
CREATE POLICY "stories_update_merged" ON public.stories
  FOR UPDATE
  USING ((( SELECT profiles.role FROM profiles WHERE (profiles.id = ( SELECT auth.uid()))) = 'admin'::text) OR ((vendor_id = ( SELECT auth.uid()))))
  WITH CHECK ((( SELECT profiles.role FROM profiles WHERE (profiles.id = ( SELECT auth.uid()))) = 'admin'::text) OR ((vendor_id = ( SELECT auth.uid()))));
CREATE POLICY "stories_delete_merged" ON public.stories
  FOR DELETE
  USING ((( SELECT profiles.role FROM profiles WHERE (profiles.id = ( SELECT auth.uid()))) = 'admin'::text) OR ((vendor_id = ( SELECT auth.uid()))));

-- ── transport_lines (src: transport_lines_admin_all, transport_lines_public_read) ──
DROP POLICY IF EXISTS "transport_lines_admin_all" ON public.transport_lines;
DROP POLICY IF EXISTS "transport_lines_public_read" ON public.transport_lines;
CREATE POLICY "transport_lines_select_merged" ON public.transport_lines
  FOR SELECT
  USING ((active = true) OR (is_admin()));
CREATE POLICY "transport_lines_insert_merged" ON public.transport_lines
  FOR INSERT
  WITH CHECK (is_admin());
CREATE POLICY "transport_lines_update_merged" ON public.transport_lines
  FOR UPDATE
  USING (is_admin())
  WITH CHECK (is_admin());
CREATE POLICY "transport_lines_delete_merged" ON public.transport_lines
  FOR DELETE
  USING (is_admin());

-- ── transport_recurrences (src: transport_recur_admin_all, transport_recur_public_read) ──
DROP POLICY IF EXISTS "transport_recur_admin_all" ON public.transport_recurrences;
DROP POLICY IF EXISTS "transport_recur_public_read" ON public.transport_recurrences;
CREATE POLICY "transport_recurrences_select_merged" ON public.transport_recurrences
  FOR SELECT
  USING ((line_id IN ( SELECT transport_lines.id FROM transport_lines WHERE (transport_lines.active = true))) OR (is_admin()));
CREATE POLICY "transport_recurrences_insert_merged" ON public.transport_recurrences
  FOR INSERT
  WITH CHECK (is_admin());
CREATE POLICY "transport_recurrences_update_merged" ON public.transport_recurrences
  FOR UPDATE
  USING (is_admin())
  WITH CHECK (is_admin());
CREATE POLICY "transport_recurrences_delete_merged" ON public.transport_recurrences
  FOR DELETE
  USING (is_admin());

-- ── transport_trips (src: trips_admin_all, trips_public_read) ──
DROP POLICY IF EXISTS "trips_admin_all" ON public.transport_trips;
DROP POLICY IF EXISTS "trips_public_read" ON public.transport_trips;
CREATE POLICY "transport_trips_select_merged" ON public.transport_trips
  FOR SELECT
  USING ((is_admin() OR (driver_id = ( SELECT auth.uid()))) OR ((status = 'scheduled'::text)));
CREATE POLICY "transport_trips_insert_merged" ON public.transport_trips
  FOR INSERT
  WITH CHECK (is_admin() OR (driver_id = ( SELECT auth.uid())));
CREATE POLICY "transport_trips_update_merged" ON public.transport_trips
  FOR UPDATE
  USING (is_admin() OR (driver_id = ( SELECT auth.uid())))
  WITH CHECK (is_admin() OR (driver_id = ( SELECT auth.uid())));
CREATE POLICY "transport_trips_delete_merged" ON public.transport_trips
  FOR DELETE
  USING (is_admin() OR (driver_id = ( SELECT auth.uid())));

-- ── transporters (src: transporters_admin_all, transporters_self_insert, transporters_self_read, transporters_self_update) ──
DROP POLICY IF EXISTS "transporters_admin_all" ON public.transporters;
DROP POLICY IF EXISTS "transporters_self_insert" ON public.transporters;
DROP POLICY IF EXISTS "transporters_self_read" ON public.transporters;
DROP POLICY IF EXISTS "transporters_self_update" ON public.transporters;
CREATE POLICY "transporters_select_merged" ON public.transporters
  FOR SELECT
  USING (((user_id = ( SELECT auth.uid()))) OR (is_admin()));
CREATE POLICY "transporters_insert_merged" ON public.transporters
  FOR INSERT
  WITH CHECK (((user_id = ( SELECT auth.uid()))) OR (is_admin()));
CREATE POLICY "transporters_update_merged" ON public.transporters
  FOR UPDATE
  USING (((user_id = ( SELECT auth.uid()))) OR (is_admin()))
  WITH CHECK (((user_id = ( SELECT auth.uid()))) OR (is_admin()));
CREATE POLICY "transporters_delete_merged" ON public.transporters
  FOR DELETE
  USING (is_admin());

-- ── troc_listings (src: troc_admin_all, troc_delete_own, troc_insert_any, troc_public_read, troc_update_own) ──
DROP POLICY IF EXISTS "troc_admin_all" ON public.troc_listings;
DROP POLICY IF EXISTS "troc_delete_own" ON public.troc_listings;
DROP POLICY IF EXISTS "troc_insert_any" ON public.troc_listings;
DROP POLICY IF EXISTS "troc_public_read" ON public.troc_listings;
DROP POLICY IF EXISTS "troc_update_own" ON public.troc_listings;
CREATE POLICY "troc_listings_select_merged" ON public.troc_listings
  FOR SELECT
  USING ((( SELECT profiles.role FROM profiles WHERE (profiles.id = ( SELECT auth.uid()))) = 'admin'::text) OR ((status = 'active'::text)));
CREATE POLICY "troc_listings_insert_merged" ON public.troc_listings
  FOR INSERT
  WITH CHECK ((( SELECT profiles.role FROM profiles WHERE (profiles.id = ( SELECT auth.uid()))) = 'admin'::text) OR (true));
CREATE POLICY "troc_listings_update_merged" ON public.troc_listings
  FOR UPDATE
  USING ((( SELECT profiles.role FROM profiles WHERE (profiles.id = ( SELECT auth.uid()))) = 'admin'::text) OR ((owner_id = ( SELECT auth.uid()))))
  WITH CHECK ((( SELECT profiles.role FROM profiles WHERE (profiles.id = ( SELECT auth.uid()))) = 'admin'::text) OR ((owner_id = ( SELECT auth.uid()))));
CREATE POLICY "troc_listings_delete_merged" ON public.troc_listings
  FOR DELETE
  USING ((( SELECT profiles.role FROM profiles WHERE (profiles.id = ( SELECT auth.uid()))) = 'admin'::text) OR ((owner_id = ( SELECT auth.uid()))));

-- ── troc_proposals (src: troc_prop_admin_all, troc_prop_insert_any, troc_prop_read, troc_prop_update_owner) ──
DROP POLICY IF EXISTS "troc_prop_admin_all" ON public.troc_proposals;
DROP POLICY IF EXISTS "troc_prop_insert_any" ON public.troc_proposals;
DROP POLICY IF EXISTS "troc_prop_read" ON public.troc_proposals;
DROP POLICY IF EXISTS "troc_prop_update_owner" ON public.troc_proposals;
CREATE POLICY "troc_proposals_select_merged" ON public.troc_proposals
  FOR SELECT
  USING ((( SELECT profiles.role FROM profiles WHERE (profiles.id = ( SELECT auth.uid()))) = 'admin'::text) OR (((proposer_id = ( SELECT auth.uid())) OR (EXISTS ( SELECT 1 FROM troc_listings l WHERE ((l.id = troc_proposals.listing_id) AND (l.owner_id = ( SELECT auth.uid()))))))));
CREATE POLICY "troc_proposals_insert_merged" ON public.troc_proposals
  FOR INSERT
  WITH CHECK ((( SELECT profiles.role FROM profiles WHERE (profiles.id = ( SELECT auth.uid()))) = 'admin'::text) OR (true));
CREATE POLICY "troc_proposals_update_merged" ON public.troc_proposals
  FOR UPDATE
  USING ((( SELECT profiles.role FROM profiles WHERE (profiles.id = ( SELECT auth.uid()))) = 'admin'::text) OR ((EXISTS ( SELECT 1 FROM troc_listings l WHERE ((l.id = troc_proposals.listing_id) AND (l.owner_id = ( SELECT auth.uid())))))))
  WITH CHECK ((( SELECT profiles.role FROM profiles WHERE (profiles.id = ( SELECT auth.uid()))) = 'admin'::text) OR ((EXISTS ( SELECT 1 FROM troc_listings l WHERE ((l.id = troc_proposals.listing_id) AND (l.owner_id = ( SELECT auth.uid())))))));
CREATE POLICY "troc_proposals_delete_merged" ON public.troc_proposals
  FOR DELETE
  USING (( SELECT profiles.role FROM profiles WHERE (profiles.id = ( SELECT auth.uid()))) = 'admin'::text);

-- ── vendor_offers (src: vendor_offers_admin, vendor_insert_offer, read_offers, vendor_offers_update) ──
DROP POLICY IF EXISTS "vendor_offers_admin" ON public.vendor_offers;
DROP POLICY IF EXISTS "vendor_insert_offer" ON public.vendor_offers;
DROP POLICY IF EXISTS "read_offers" ON public.vendor_offers;
DROP POLICY IF EXISTS "vendor_offers_update" ON public.vendor_offers;
CREATE POLICY "vendor_offers_select_merged" ON public.vendor_offers
  FOR SELECT
  USING ((((( SELECT auth.uid()) = vendor_id) OR (( SELECT auth.uid()) = ( SELECT buyer_requests.buyer_id FROM buyer_requests WHERE (buyer_requests.id = vendor_offers.request_id))) OR ((vendor_id = ( SELECT auth.uid())) OR (EXISTS ( SELECT 1 FROM buyer_requests br WHERE ((br.id = COALESCE(vendor_offers.original_offer_id, vendor_offers.request_id)) AND (br.buyer_id = ( SELECT auth.uid())))))))) OR ((auth_user_role() = 'admin'::text)));
CREATE POLICY "vendor_offers_insert_merged" ON public.vendor_offers
  FOR INSERT
  WITH CHECK ((((( SELECT auth.uid()) = vendor_id) OR (vendor_id = ( SELECT auth.uid())))) OR ((auth_user_role() = 'admin'::text)));
CREATE POLICY "vendor_offers_update_merged" ON public.vendor_offers
  FOR UPDATE
  USING ((((vendor_id = ( SELECT auth.uid())) OR (EXISTS ( SELECT 1 FROM buyer_requests br WHERE ((br.id = COALESCE(vendor_offers.original_offer_id, vendor_offers.request_id)) AND (br.buyer_id = ( SELECT auth.uid()))))) OR (( SELECT auth.uid()) = vendor_id))) OR ((auth_user_role() = 'admin'::text)))
  WITH CHECK ((((vendor_id = ( SELECT auth.uid())) OR (EXISTS ( SELECT 1 FROM buyer_requests br WHERE ((br.id = COALESCE(vendor_offers.original_offer_id, vendor_offers.request_id)) AND (br.buyer_id = ( SELECT auth.uid()))))) OR (( SELECT auth.uid()) = vendor_id))) OR ((auth_user_role() = 'admin'::text)));
CREATE POLICY "vendor_offers_delete_merged" ON public.vendor_offers
  FOR DELETE
  USING (auth_user_role() = 'admin'::text);

-- ── whatsapp_logs (src: wa_logs_admin_only, wa_logs_auth_insert, wa_logs_admin_read) ──
DROP POLICY IF EXISTS "wa_logs_admin_only" ON public.whatsapp_logs;
DROP POLICY IF EXISTS "wa_logs_auth_insert" ON public.whatsapp_logs;
DROP POLICY IF EXISTS "wa_logs_admin_read" ON public.whatsapp_logs;
CREATE POLICY "whatsapp_logs_select_merged" ON public.whatsapp_logs
  FOR SELECT
  USING ((( SELECT profiles.role FROM profiles WHERE (profiles.id = ( SELECT auth.uid()))) = 'admin'::text) OR ((EXISTS ( SELECT 1 FROM profiles WHERE ((profiles.id = ( SELECT auth.uid())) AND (profiles.role = 'admin'::text))))));
CREATE POLICY "whatsapp_logs_insert_merged" ON public.whatsapp_logs
  FOR INSERT
  WITH CHECK ((( SELECT auth.role()) = 'authenticated'::text) OR ((EXISTS ( SELECT 1 FROM profiles WHERE ((profiles.id = ( SELECT auth.uid())) AND (profiles.role = 'admin'::text))))));
CREATE POLICY "whatsapp_logs_update_merged" ON public.whatsapp_logs
  FOR UPDATE
  USING (EXISTS ( SELECT 1 FROM profiles WHERE ((profiles.id = ( SELECT auth.uid())) AND (profiles.role = 'admin'::text))))
  WITH CHECK (EXISTS ( SELECT 1 FROM profiles WHERE ((profiles.id = ( SELECT auth.uid())) AND (profiles.role = 'admin'::text))));
CREATE POLICY "whatsapp_logs_delete_merged" ON public.whatsapp_logs
  FOR DELETE
  USING (EXISTS ( SELECT 1 FROM profiles WHERE ((profiles.id = ( SELECT auth.uid())) AND (profiles.role = 'admin'::text))));
