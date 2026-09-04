-- ════════════════════════════════════════════════════════════════════════════
--  Corrige les avertissements PERFORMANCE remontés par l'advisor Supabase
--  (get_advisors, 2026-09-04, dans le cadre du diagnostic budget IO récurrent —
--  voir JOURNAL.md) :
--
--  1) auth_rls_initplan (5 occurrences) : auth.<fn>()/current_setting()
--     réévalués À CHAQUE LIGNE au lieu d'une fois par requête dans une policy
--     RLS → wrap `(select auth.<fn>())` (pattern documenté Supabase :
--     https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select).
--     AUCUN changement de sémantique de sécurité — même condition logique,
--     juste un meilleur plan d'exécution (évalué une fois, pas par ligne).
--     4 sur les policies quote_requests/quote_responses du 2026-09-04
--     (sql/2026_09_04_devis_chantier.sql), 1 pré-existante (maintenance_log).
--
--  2) unindexed_foreign_keys (1 occurrence) : quote_requests.selected_response_id
--     référence quote_responses(id) sans index de couverture.
--
--  ⚠️ NON traité ici (délibérément) — 2 autres catégories remontées par le
--  même advisor, à ne PAS corriger sans revue séparée :
--  - `multiple_permissive_policies` (656 occurrences, 60 tables) : problème
--    RÉEL et pré-existant (bien avant ce jour), mais fusionner des policies
--    RLS est sensible sécurité (risque de sur/sous-octroi d'accès si mal
--    fait) — chantier à part, table par table, PAS un fix en masse.
--  - `unused_index` (310 occurrences) : signal CONTAMINÉ — le restart compute
--    du même jour (incident budget IO) a réinitialisé idx_scan pour TOUS les
--    index (vérifié : idx_pros_status/idx_pros_profession y apparaissent
--    alors qu'ils sont activement utilisés par nearby_pros, en prod depuis
--    des mois). Ne PAS dropper d'index sur la foi de ce rapport avant que
--    les compteurs aient eu le temps de réaccumuler un usage réel (quelques
--    semaines), sous peine de dégrader des requêtes actives.
-- ════════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS quote_requests_buyer_own ON public.quote_requests;
CREATE POLICY quote_requests_buyer_own ON public.quote_requests
  FOR ALL USING (buyer_id = (select auth.uid())) WITH CHECK (buyer_id = (select auth.uid()));

DROP POLICY IF EXISTS quote_requests_pro_notified ON public.quote_requests;
CREATE POLICY quote_requests_pro_notified ON public.quote_requests
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.quote_responses r
      JOIN public.pros pr ON pr.id = r.pro_id
      WHERE r.request_id = quote_requests.id AND pr.user_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS quote_responses_pro_own ON public.quote_responses;
CREATE POLICY quote_responses_pro_own ON public.quote_responses
  FOR ALL USING (pro_id IN (SELECT id FROM public.pros WHERE user_id = (select auth.uid())))
  WITH CHECK (pro_id IN (SELECT id FROM public.pros WHERE user_id = (select auth.uid())));

DROP POLICY IF EXISTS quote_responses_buyer_read ON public.quote_responses;
CREATE POLICY quote_responses_buyer_read ON public.quote_responses
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.quote_requests q WHERE q.id = quote_responses.request_id AND q.buyer_id = (select auth.uid()))
  );

DROP POLICY IF EXISTS ml_service_all ON public.maintenance_log;
CREATE POLICY ml_service_all ON public.maintenance_log
  FOR ALL USING (
    ((select current_setting('request.jwt.claims'::text, true))::jsonb ->> 'role'::text) = 'service_role'::text
  );

CREATE INDEX IF NOT EXISTS idx_quote_requests_selected_response ON public.quote_requests(selected_response_id);
