-- ============================================================================
-- NEXUS Market — Audit RLS / GRANT (table + colonne) (#2 roadmap pro)
-- ----------------------------------------------------------------------------
-- Détecte le piège RÉCURRENT du projet : GRANT (surtout au niveau COLONNE)
-- manquant → 403 silencieux à l'écriture ; ou table sans policy RLS ; ou RLS
-- désactivée exposant des données.
--
-- Lancer (nécessite le token Supabase management) :
--   node scripts/db-query.mjs --file scripts/audit-rls-grants.sql
--
-- L'API management renvoie le résultat de la DERNIÈRE requête. Lance donc les
-- blocs UN PAR UN (copie/colle chaque SELECT), OU garde le diagnostic unifié
-- ci-dessous (bloc A) qui retourne tout en une fois.
-- ============================================================================

-- ── BLOC A — Diagnostic unifié (un seul run, sortie étiquetée) ──────────────
select 'RLS_DESACTIVEE' as verif, relname as detail
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
union all
select 'RLS_SANS_POLICY', c.relname
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity
    and not exists (select 1 from pg_policy p where p.polrelid = c.oid)
union all
select 'GRANT_TABLE_' || grantee, table_name || ' → ' || string_agg(privilege_type, ',' order by privilege_type)
  from information_schema.role_table_grants
  where table_schema = 'public' and grantee in ('anon', 'authenticated')
  group by grantee, table_name
order by 1, 2;

-- ── BLOC B — GRANTs au niveau COLONNE (le piège n°1 : UPDATE colonne manquant) ─
-- Colonnes explicitement grantées à authenticated (si une table a des grants
-- COLONNE, les colonnes NON listées ne sont PAS accessibles → 403).
-- select table_name, grantee, privilege_type, string_agg(column_name, ', ' order by column_name) as colonnes
--   from information_schema.column_privileges
--   where table_schema = 'public' and grantee in ('anon', 'authenticated')
--   group by table_name, grantee, privilege_type
--   order by table_name, grantee, privilege_type;

-- ── BLOC C — Focus profiles (colonnes sensibles + home_lat/home_lng ajouté 08-02) ─
-- Vérifie que authenticated a bien UPDATE sur home_lat/home_lng (sinon la
-- sauvegarde « position boutique » échouera en 403 silencieux).
-- select privilege_type, grantee, column_name
--   from information_schema.column_privileges
--   where table_schema = 'public' and table_name = 'profiles'
--     and column_name in ('home_lat','home_lng','current_lat','current_lng')
--   order by column_name, grantee, privilege_type;
-- Si BLOC C ne renvoie AUCUNE ligne pour home_lat/home_lng ET que profiles a des
-- grants colonne (BLOC B) → il manque le GRANT. Correctif :
--   grant update (home_lat, home_lng) on public.profiles to authenticated;

-- ── BLOC D — Policies existantes par table (revue manuelle) ─────────────────
-- select schemaname, tablename, policyname, cmd, roles, qual, with_check
--   from pg_policies where schemaname = 'public' order by tablename, cmd;
