-- 2026_06_07_drop_refresh_tokens.sql
-- NETTOYAGE : suppression de la table `refresh_tokens` (vestige d'une approche
-- JWT custom abandonnée). Supabase Auth gère nativement la rotation des access
-- tokens via ses propres refresh tokens — cette table n'est utilisée nulle part
-- dans le code (cf. CLAUDE.md §Authentification & refresh tokens).
--
-- Idempotent et sûr : DROP ... IF EXISTS. Les politiques RLS et index associés
-- sont supprimés en cascade avec la table.
--
-- ⚠️ À exécuter sur la base Supabase déployée (SQL Editor ou psql).

BEGIN;

DROP TABLE IF EXISTS public.refresh_tokens CASCADE;

COMMIT;
