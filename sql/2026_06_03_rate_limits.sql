-- ============================================================
-- 2026_06_03_rate_limits.sql
-- Rate limiting backé par Postgres (pas besoin de Cloudflare KV / Durable Objects).
-- Fenêtre fixe atomique via RPC appelée par functions/api/_lib/ratelimit.js.
-- À exécuter une fois dans Supabase (SQL Editor).
-- ============================================================

CREATE TABLE IF NOT EXISTS rate_limits (
  key          TEXT PRIMARY KEY,
  count        INT NOT NULL DEFAULT 0,
  window_start TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS : accès uniquement via service_role (les RPC SECURITY DEFINER bypassent).
ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;

-- Incrémente le compteur pour `p_key` sur une fenêtre de p_window_seconds.
-- Retourne allowed/remaining/reset_at. Atomique (INSERT ... ON CONFLICT).
CREATE OR REPLACE FUNCTION rate_limit_hit(
  p_key            TEXT,
  p_max            INT,
  p_window_seconds INT
)
RETURNS TABLE(allowed BOOLEAN, remaining INT, reset_at TIMESTAMPTZ)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_now   TIMESTAMPTZ := NOW();
  v_count INT;
  v_start TIMESTAMPTZ;
BEGIN
  INSERT INTO rate_limits(key, count, window_start)
  VALUES (p_key, 1, v_now)
  ON CONFLICT (key) DO UPDATE
    SET count = CASE
                  WHEN rate_limits.window_start < v_now - make_interval(secs => p_window_seconds)
                  THEN 1
                  ELSE rate_limits.count + 1
                END,
        window_start = CASE
                  WHEN rate_limits.window_start < v_now - make_interval(secs => p_window_seconds)
                  THEN v_now
                  ELSE rate_limits.window_start
                END
  RETURNING count, window_start INTO v_count, v_start;

  RETURN QUERY
    SELECT (v_count <= p_max),
           GREATEST(0, p_max - v_count),
           v_start + make_interval(secs => p_window_seconds);
END;
$$;

-- Purge optionnelle des compteurs anciens (à appeler depuis le cron cleanup).
CREATE OR REPLACE FUNCTION rate_limits_purge(p_older_than_seconds INT DEFAULT 3600)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE v_deleted INT;
BEGIN
  DELETE FROM rate_limits
  WHERE window_start < NOW() - make_interval(secs => p_older_than_seconds);
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;
