-- ============================================================================
-- 2026_06_10_rls_audit.sql — Audit & durcissement RLS (SÉCURITÉ #4)
-- ============================================================================
-- CONTEXTE : la clé Supabase ANON est publiée dans le bundle public
-- (public/index.html). C'est normal POUR AUTANT que la Row Level Security (RLS)
-- soit ACTIVE et correctement définie sur CHAQUE table. Sinon, n'importe qui
-- peut lire/écrire la table directement via la clé publique.
--
-- ⚠️ Ce fichier est en DEUX parties :
--   PARTIE A — AUDIT (lecture seule, à exécuter d'abord) : liste les tables
--              SANS RLS et celles SANS policy. AUCUN risque à l'exécuter.
--   PARTIE B — DURCISSEMENT (template COMMENTÉ) : à RELIRE puis dé-commenter
--              table par table. NE PAS appliquer en bloc à l'aveugle —
--              activer la RLS sans policy adéquate VERROUILLE la table.
--
-- À exécuter dans Supabase → SQL Editor (rôle postgres).
-- ============================================================================


-- ============================================================================
-- PARTIE A — AUDIT (LECTURE SEULE) ───────────────────────────────────────────
-- ============================================================================

-- A.1 — Tables du schéma public AVEC l'état RLS (rls_enabled = false → EXPOSÉE)
SELECT n.nspname              AS schema,
       c.relname             AS table_name,
       c.relrowsecurity      AS rls_enabled,
       c.relforcerowsecurity AS rls_forced
FROM   pg_class c
JOIN   pg_namespace n ON n.oid = c.relnamespace
WHERE  c.relkind = 'r'
  AND  n.nspname = 'public'
ORDER  BY c.relrowsecurity ASC, c.relname;  -- les NON protégées en premier

-- A.2 — Tables avec RLS ACTIVE mais SANS AUCUNE policy (→ tout est refusé,
--       sauf service_role ; souvent un oubli qui casse l'app OU au contraire
--       une table jamais lue côté client).
SELECT c.relname AS table_name_rls_on_but_no_policy
FROM   pg_class c
JOIN   pg_namespace n ON n.oid = c.relnamespace
WHERE  c.relkind = 'r'
  AND  n.nspname = 'public'
  AND  c.relrowsecurity = true
  AND  NOT EXISTS (
         SELECT 1 FROM pg_policies p
         WHERE p.schemaname = 'public' AND p.tablename = c.relname
       )
ORDER  BY c.relname;

-- A.3 — Inventaire des policies existantes (pour revue)
SELECT schemaname, tablename, policyname, cmd, roles, qual, with_check
FROM   pg_policies
WHERE  schemaname = 'public'
ORDER  BY tablename, policyname;

-- Interprétation :
--   • Toute table de A.1 avec rls_enabled = false ET lisible/écrite côté client
--     est une FAILLE → activer la RLS + policies (Partie B).
--   • Tables purement back-office (écrites uniquement via service_role dans
--     functions/**) : activer la RLS SANS policy publique suffit (le
--     service_role bypasse la RLS). Ex : rate_limits, admin_logs, email_logs.


-- ============================================================================
-- PARTIE B — DURCISSEMENT (TEMPLATE À RELIRE — NE PAS DÉ-COMMENTER EN BLOC) ───
-- ============================================================================
-- Rappel : le service_role (utilisé par functions/**) IGNORE la RLS. Les
-- policies ci-dessous ne concernent donc que l'accès via la clé ANON (client).
-- Colonnes de référence (cf. CLAUDE.md) : orders.buyer_id / orders.vendor_id.

-- ── orders : l'acheteur voit/écrit SES commandes ; le vendeur voit les siennes.
--    Les écritures sensibles (payment_status, total…) passent par les Functions
--    (service_role) ; le client ne doit PAS pouvoir modifier payment_status.
-- ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY orders_buyer_select  ON public.orders FOR SELECT
--   USING (auth.uid() = buyer_id OR auth.uid() = vendor_id);
-- CREATE POLICY orders_buyer_insert  ON public.orders FOR INSERT
--   WITH CHECK (auth.uid() = buyer_id);
-- -- Pas de policy UPDATE/DELETE côté client → réservé au service_role.

-- ── profiles : chacun lit/modifie SON profil ; lecture publique limitée si
--    besoin (nom vendeur). N'autorisez PAS le client à changer `role`/`status`.
-- ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY profiles_self_select ON public.profiles FOR SELECT
--   USING (auth.uid() = id);
-- CREATE POLICY profiles_self_update ON public.profiles FOR UPDATE
--   USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- ── notifications : chacun lit/màj SES notifications. Création via Functions.
-- ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY notif_owner_select ON public.notifications FOR SELECT
--   USING (auth.uid() = user_id);
-- CREATE POLICY notif_owner_update ON public.notifications FOR UPDATE
--   USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ── payout_requests : le vendeur lit SES demandes ; création/maj via Functions
--    UNIQUEMENT (le client ne crée jamais un payout directement).
-- ALTER TABLE public.payout_requests ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY payout_vendor_select ON public.payout_requests FOR SELECT
--   USING (auth.uid() = vendor_id);

-- ── stories / push_subscriptions / stock_alerts : propriétaire = user/vendor.
-- ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY push_owner_all ON public.push_subscriptions FOR ALL
--   USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ── Tables back-office (écrites seulement par service_role) : RLS ON, 0 policy.
-- ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.admin_logs  ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.email_logs  ENABLE ROW LEVEL SECURITY;

-- ── products : lecture publique des produits actifs ; écriture par le vendeur
--    propriétaire (ou service_role). Adapter selon le nom de colonne vendeur.
-- ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY products_public_read ON public.products FOR SELECT
--   USING (active = true);
-- CREATE POLICY products_vendor_write ON public.products FOR ALL
--   USING (auth.uid() = vendor_id) WITH CHECK (auth.uid() = vendor_id);

-- ============================================================================
-- PROCÉDURE RECOMMANDÉE
--   1. Exécuter PARTIE A, noter les tables NON protégées effectivement
--      accessibles côté client.
--   2. Pour chacune : dé-commenter le bloc correspondant, ADAPTER les noms de
--      colonnes au schéma réellement déployé (cf. §4 CLAUDE.md : deux jeux de
--      migrations divergents → vérifier les colonnes réelles), puis exécuter.
--   3. Re-tester l'app (lecture commandes, profil, notifs, checkout) avec un
--      compte NON-admin pour confirmer qu'aucune policy ne casse un flux.
-- ============================================================================
