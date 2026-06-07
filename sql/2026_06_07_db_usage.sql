-- 2026_06_07_db_usage.sql
-- RPC `db_usage` : taille de la base + pourcentage du quota, pour la surveillance
-- du tier gratuit Supabase (500 Mo). Consommé par functions/cron/db-usage.js qui
-- alerte au-delà d'un seuil (défaut 70 %) — mitigation PM-04 (panne au pic Tabaski).
--
-- ⚠️ À exécuter sur la base Supabase déployée (SQL Editor ou psql).

BEGIN;

CREATE OR REPLACE FUNCTION public.db_usage(p_limit_mb INT DEFAULT 500)
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'size_bytes', pg_database_size(current_database()),
    'size_mb',    round(pg_database_size(current_database()) / 1048576.0, 1),
    'limit_mb',   p_limit_mb,
    'pct',        round(100.0 * pg_database_size(current_database()) / (p_limit_mb * 1048576.0), 1)
  );
$$;

-- Appelée uniquement côté serveur via la service key.
REVOKE ALL ON FUNCTION public.db_usage(INT) FROM PUBLIC, anon, authenticated;

COMMIT;
