-- ════════════════════════════════════════════════════════════════════════════
--  Consolidation des policies RLS PERMISSIVE redondantes — LOT 2
--  (les 18 tables laissées de côté par sql/2026_09_04_merge_permissive_policies.sql
--  car le rôle-cible différait entre policies en conflit — cf. JOURNAL.md).
--
--  Méthode DIFFÉRENTE du lot 1, plus prudente, car un simple OR sur des rôles
--  différents peut ÉLARGIR l'accès si une des policies contributrices a une
--  condition inconditionnelle (`true`) restreinte à un rôle étroit (ex.
--  `service_role`) : la fusionner dans une policy visée plus large (`public`)
--  donnerait ce `true` à TOUT LE MONDE. Deux techniques utilisées à la place :
--
--  1) SUBSOMPTION (la grande majorité des cas ici) : quand une policy B, visant
--     un sur-ensemble des rôles de A, a une condition qui couvre déjà tout ce
--     que A autorise, alors A est purement redondante — on la SUPPRIME sans
--     rien recréer. Aucun changement de comportement, risque nul.
--     Ex. `cart_own` (public, user_id=auth.uid()) rend `carts_owner_all`
--     (authenticated, même condition) totalement redondante.
--
--  2) FUSION CIBLÉE avec `TO <rôle>` explicite quand une policy à condition
--     inconditionnelle est restreinte à un rôle précis (ex. `service_role`
--     avec qual=true) : on NE LA TOUCHE JAMAIS (laissée telle quelle) — elle
--     n'entre dans AUCUNE fusion. Les autres policies (mêmes conditions
--     auto-restrictives type auth.uid()=x, is_admin()) sont fusionnées par OR
--     normalement, éventuellement en conservant un `TO authenticated` explicite
--     si une des conditions sources n'était vraie que pour ce rôle précis.
--
--  Toutes les policies `{service_role}, qual=true` (accès total du backend)
--  sont donc volontairement ABSENTES de ce fichier — elles restent en place,
--  inchangées : coupon_service_all, carts_service_all, buyer_pro service_role,
--  email_logs_service, inv_seq_service_all, invoices_service_role,
--  notif_service_all, referrals_service_all, vendor_ref_service_all.
--
--  Idempotent (DROP IF EXISTS + CREATE).
-- ════════════════════════════════════════════════════════════════════════════

-- ── audit_logs : audit_insert_auth (public, auth.role()='authenticated')
--    redondante avec audit_logs_insert (authenticated, true) — même résultat
--    net (seul un utilisateur authentifié peut insérer, dans les deux cas).
DROP POLICY IF EXISTS "audit_insert_auth" ON public.audit_logs;

-- ── banners : fusion admin (authenticated) + lecture publique (public) ──
DROP POLICY IF EXISTS "banners_admin_all" ON public.banners;
DROP POLICY IF EXISTS "banners_public_read" ON public.banners;
CREATE POLICY "banners_select_merged" ON public.banners
  FOR SELECT
  USING ((EXISTS ( SELECT 1 FROM profiles p WHERE ((p.id = ( SELECT auth.uid())) AND (p.role = 'admin'::text)))) OR (active = true));
CREATE POLICY "banners_insert_merged" ON public.banners
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS ( SELECT 1 FROM profiles p WHERE ((p.id = ( SELECT auth.uid())) AND (p.role = 'admin'::text))));
CREATE POLICY "banners_update_merged" ON public.banners
  FOR UPDATE TO authenticated
  USING (EXISTS ( SELECT 1 FROM profiles p WHERE ((p.id = ( SELECT auth.uid())) AND (p.role = 'admin'::text))))
  WITH CHECK (EXISTS ( SELECT 1 FROM profiles p WHERE ((p.id = ( SELECT auth.uid())) AND (p.role = 'admin'::text))));
CREATE POLICY "banners_delete_merged" ON public.banners
  FOR DELETE TO authenticated
  USING (EXISTS ( SELECT 1 FROM profiles p WHERE ((p.id = ( SELECT auth.uid())) AND (p.role = 'admin'::text))));

-- ── buyer_pro_profiles : buyer_pro_read_own (authenticated) redondante avec
--    buyer_pro_select_own_or_admin (public, condition plus large). service_role
--    et buyer_pro_insert_own laissées intactes (pas en conflit entre elles).
DROP POLICY IF EXISTS "buyer_pro_read_own" ON public.buyer_pro_profiles;

-- ── carts : carts_owner_all (authenticated) redondante avec cart_own (public,
--    même condition exacte). carts_service_all laissée intacte.
DROP POLICY IF EXISTS "carts_owner_all" ON public.carts;

-- ── cashback_transactions : cashback_select_own (authenticated) redondante
--    avec user_read_cashback (public, même condition).
DROP POLICY IF EXISTS "cashback_select_own" ON public.cashback_transactions;

-- ── coupons : fusion admin (public) + lecture publique (public), même
--    role-scope — coupon_service_all (service_role, true) laissée intacte.
DROP POLICY IF EXISTS "coupon_admin_all" ON public.coupons;
DROP POLICY IF EXISTS "coupon_public_read" ON public.coupons;
CREATE POLICY "coupons_select_merged" ON public.coupons
  FOR SELECT
  USING (is_admin() OR (active = true));
CREATE POLICY "coupons_insert_merged" ON public.coupons
  FOR INSERT
  WITH CHECK (is_admin());
CREATE POLICY "coupons_update_merged" ON public.coupons
  FOR UPDATE
  USING (is_admin())
  WITH CHECK (is_admin());
CREATE POLICY "coupons_delete_merged" ON public.coupons
  FOR DELETE
  USING (is_admin());

-- ── disputes : dispute_insert_buyer, dispute_select_party (authenticated) ET
--    buyer_sees_own_disputes (public, SELECT) sont entièrement redondantes
--    avec admin_all_disputes (public, ALL) — sa condition OR inclut déjà
--    littéralement buyer_id=uid OR vendor_id=uid. buyer_sees_own_disputes
--    oubliée dans la 1ère passe, corrigée le même jour (voir JOURNAL.md).
DROP POLICY IF EXISTS "dispute_insert_buyer" ON public.disputes;
DROP POLICY IF EXISTS "dispute_select_party" ON public.disputes;
DROP POLICY IF EXISTS "buyer_sees_own_disputes" ON public.disputes;

-- ── email_logs : email_logs_admin (authenticated) redondante avec
--    email_logs_admin_read (public, même condition). email_logs_service et
--    email_logs_auth_insert laissées intactes.
DROP POLICY IF EXISTS "email_logs_admin" ON public.email_logs;

-- ── invoice_sequences : inv_seq_auth_read a qual=true mais restreint à
--    `authenticated` — fusion en conservant ce périmètre explicite (TO
--    authenticated) pour ne pas donner un accès inconditionnel à anon.
--    inv_seq_service_all (service_role, true) laissée intacte.
DROP POLICY IF EXISTS "inv_seq_service_only" ON public.invoice_sequences;
DROP POLICY IF EXISTS "inv_seq_auth_read" ON public.invoice_sequences;
CREATE POLICY "invoice_sequences_select_merged" ON public.invoice_sequences
  FOR SELECT TO authenticated
  USING (true);
CREATE POLICY "invoice_sequences_insert_merged" ON public.invoice_sequences
  FOR INSERT
  WITH CHECK (is_admin());
CREATE POLICY "invoice_sequences_update_merged" ON public.invoice_sequences
  FOR UPDATE
  USING (is_admin())
  WITH CHECK (is_admin());
CREATE POLICY "invoice_sequences_delete_merged" ON public.invoice_sequences
  FOR DELETE
  USING (is_admin());

-- ── invoices : fusion admin (public) + propriétaire (authenticated), les
--    deux conditions auto-restrictives. invoices_service_role laissée intacte.
DROP POLICY IF EXISTS "admin_all_invoices" ON public.invoices;
DROP POLICY IF EXISTS "invoices_owner" ON public.invoices;
CREATE POLICY "invoices_select_merged" ON public.invoices
  FOR SELECT
  USING ((auth_user_role() = 'admin'::text) OR ((buyer_id = ( SELECT auth.uid())) OR (vendor_id = ( SELECT auth.uid()))));
CREATE POLICY "invoices_insert_merged" ON public.invoices
  FOR INSERT
  WITH CHECK (auth_user_role() = 'admin'::text);
CREATE POLICY "invoices_update_merged" ON public.invoices
  FOR UPDATE
  USING (auth_user_role() = 'admin'::text)
  WITH CHECK (auth_user_role() = 'admin'::text);
CREATE POLICY "invoices_delete_merged" ON public.invoices
  FOR DELETE
  USING (auth_user_role() = 'admin'::text);

-- ── loyalty_points : loyalty_select_own (authenticated) redondante avec
--    loyalty_points_select_own (public, même condition).
DROP POLICY IF EXISTS "loyalty_select_own" ON public.loyalty_points;

-- ── notifications : toutes les policies contributrices sont déjà en {public}
--    (notif_service_all, seule en {service_role}, laissée intacte).
DROP POLICY IF EXISTS "notif_admin_all" ON public.notifications;
DROP POLICY IF EXISTS "notif_delete_own" ON public.notifications;
DROP POLICY IF EXISTS "notif_insert_authenticated" ON public.notifications;
DROP POLICY IF EXISTS "notif_select_own" ON public.notifications;
DROP POLICY IF EXISTS "notif_update_own" ON public.notifications;
CREATE POLICY "notifications_select_merged" ON public.notifications
  FOR SELECT
  USING (is_admin() OR (( SELECT auth.uid()) = user_id));
CREATE POLICY "notifications_insert_merged" ON public.notifications
  FOR INSERT
  WITH CHECK (is_admin() OR (( SELECT auth.role()) = 'authenticated'::text));
CREATE POLICY "notifications_update_merged" ON public.notifications
  FOR UPDATE
  USING (is_admin() OR (( SELECT auth.uid()) = user_id))
  WITH CHECK (is_admin() OR (( SELECT auth.uid()) = user_id));
CREATE POLICY "notifications_delete_merged" ON public.notifications
  FOR DELETE
  USING (is_admin() OR (( SELECT auth.uid()) = user_id));

-- ── payout_requests : les 3 policies "own" (authenticated + public) sont
--    toutes des sous-cas de payout_admin_all (public, is_admin() OR
--    auth.uid()=vendor_id) — entièrement redondantes.
DROP POLICY IF EXISTS "payout_insert_own" ON public.payout_requests;
DROP POLICY IF EXISTS "payout_select_own" ON public.payout_requests;
DROP POLICY IF EXISTS "vendor_read_own_payouts" ON public.payout_requests;

-- ── products : products_public_read cible {anon,authenticated} plutôt que
--    {public}, mais sans condition inconditionnelle (active IS NOT FALSE) —
--    fusion normale sans risque d'élargissement.
DROP POLICY IF EXISTS "products_admin_all" ON public.products;
DROP POLICY IF EXISTS "products_delete_own" ON public.products;
DROP POLICY IF EXISTS "products_insert_own" ON public.products;
DROP POLICY IF EXISTS "products_public_read" ON public.products;
DROP POLICY IF EXISTS "products_select_own" ON public.products;
DROP POLICY IF EXISTS "products_update_own" ON public.products;
CREATE POLICY "products_select_merged" ON public.products
  FOR SELECT
  USING (is_admin() OR (( SELECT auth.uid()) = vendor_id) OR (active IS NOT FALSE));
CREATE POLICY "products_insert_merged" ON public.products
  FOR INSERT
  WITH CHECK (is_admin() OR (( SELECT auth.uid()) = vendor_id));
CREATE POLICY "products_update_merged" ON public.products
  FOR UPDATE
  USING (is_admin() OR (( SELECT auth.uid()) = vendor_id))
  WITH CHECK (is_admin() OR (( SELECT auth.uid()) = vendor_id));
CREATE POLICY "products_delete_merged" ON public.products
  FOR DELETE
  USING (is_admin() OR (( SELECT auth.uid()) = vendor_id));

-- ── referrals : fusion admin + own, toutes deux {public}.
--    referrals_service_all (service_role, true) laissée intacte.
DROP POLICY IF EXISTS "ref_admin_all" ON public.referrals;
DROP POLICY IF EXISTS "ref_insert_own" ON public.referrals;
DROP POLICY IF EXISTS "ref_select_own" ON public.referrals;
CREATE POLICY "referrals_select_merged" ON public.referrals
  FOR SELECT
  USING (is_admin() OR (( SELECT auth.uid()) = referrer_id) OR (( SELECT auth.uid()) = referred_id));
CREATE POLICY "referrals_insert_merged" ON public.referrals
  FOR INSERT
  WITH CHECK (is_admin() OR (( SELECT auth.uid()) = referrer_id));
CREATE POLICY "referrals_update_merged" ON public.referrals
  FOR UPDATE
  USING (is_admin())
  WITH CHECK (is_admin());
CREATE POLICY "referrals_delete_merged" ON public.referrals
  FOR DELETE
  USING (is_admin());

-- ── server_logs : server_logs_backend_only (qual=false, check=false) ne sert
--    à rien (deny explicite alors que le défaut RLS est déjà deny) — retirée
--    sans remplacement, comportement identique. server_logs_select_admin
--    (authenticated) redondante avec server_logs_admin (public, même check).
DROP POLICY IF EXISTS "server_logs_backend_only" ON public.server_logs;
DROP POLICY IF EXISTS "server_logs_select_admin" ON public.server_logs;

-- ── vendor_referrals : vendor_ref_insert_auth a check=true mais restreint à
--    `authenticated` — fusion en conservant ce périmètre explicite.
--    vendor_ref_service_all (service_role, true) laissée intacte.
DROP POLICY IF EXISTS "vref_admin_all" ON public.vendor_referrals;
DROP POLICY IF EXISTS "vendor_ref_insert_auth" ON public.vendor_referrals;
DROP POLICY IF EXISTS "vref_insert_own" ON public.vendor_referrals;
DROP POLICY IF EXISTS "vendor_ref_select_own" ON public.vendor_referrals;
DROP POLICY IF EXISTS "vref_select_own" ON public.vendor_referrals;
CREATE POLICY "vendor_referrals_select_merged" ON public.vendor_referrals
  FOR SELECT
  USING (is_admin() OR (referrer_id = ( SELECT auth.uid())) OR (new_vendor_id = ( SELECT auth.uid())) OR (vendor_id = ( SELECT auth.uid())));
CREATE POLICY "vendor_referrals_insert_merged" ON public.vendor_referrals
  FOR INSERT TO authenticated
  WITH CHECK (true);
CREATE POLICY "vendor_referrals_update_merged" ON public.vendor_referrals
  FOR UPDATE
  USING (is_admin())
  WITH CHECK (is_admin());
CREATE POLICY "vendor_referrals_delete_merged" ON public.vendor_referrals
  FOR DELETE
  USING (is_admin());

-- ── "nexus-images" : images_own (ALL) redondante avec images_public_read pour
--    le SELECT (qual=true, déjà le moins restrictif possible) — recréée
--    seulement pour INSERT/UPDATE/DELETE, seules actions non couvertes.
DROP POLICY IF EXISTS "images_own" ON public."nexus-images";
CREATE POLICY "nexus-images_insert_merged" ON public."nexus-images"
  FOR INSERT
  WITH CHECK (( SELECT auth.uid()) = user_id);
CREATE POLICY "nexus-images_update_merged" ON public."nexus-images"
  FOR UPDATE
  USING (( SELECT auth.uid()) = user_id)
  WITH CHECK (( SELECT auth.uid()) = user_id);
CREATE POLICY "nexus-images_delete_merged" ON public."nexus-images"
  FOR DELETE
  USING (( SELECT auth.uid()) = user_id);
