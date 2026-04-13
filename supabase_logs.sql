-- ═══════════════════════════════════════════════════════════════
-- NEXUS Market — Table de logs serveur
-- Exécuter dans Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS server_logs (
  id          BIGSERIAL    PRIMARY KEY,
  ts          TIMESTAMPTZ  NOT NULL DEFAULT now(),
  level       TEXT         NOT NULL CHECK (level IN ('info','warn','error','debug')),
  category    TEXT         NOT NULL,  -- 'auth' | 'order' | 'payment' | 'api' | 'system' | 'email'
  action      TEXT         NOT NULL,  -- ex: 'login', 'order.created', 'stripe.webhook'
  user_id     UUID         REFERENCES profiles(id) ON DELETE SET NULL,
  user_email  TEXT,
  user_role   TEXT,
  method      TEXT,                   -- GET / POST / PATCH ...
  path        TEXT,                   -- /api/orders
  status      INTEGER,               -- HTTP status code
  duration_ms INTEGER,               -- temps de réponse
  ip          TEXT,
  message     TEXT         NOT NULL,
  meta        JSONB                   -- données complémentaires libres
);

-- Index utiles pour les dashboards
CREATE INDEX IF NOT EXISTS idx_logs_ts       ON server_logs(ts DESC);
CREATE INDEX IF NOT EXISTS idx_logs_level    ON server_logs(level);
CREATE INDEX IF NOT EXISTS idx_logs_category ON server_logs(category);
CREATE INDEX IF NOT EXISTS idx_logs_user     ON server_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_logs_status   ON server_logs(status);

-- Purge automatique : supprimer les logs > 90 jours via pg_cron (optionnel)
-- SELECT cron.schedule('purge-old-logs', '0 3 * * *',
--   $$DELETE FROM server_logs WHERE ts < now() - INTERVAL '90 days'$$);

-- RLS : seul le backend (service_role) écrit ; seul l'admin lit
ALTER TABLE server_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "logs_admin_read"    ON server_logs;
DROP POLICY IF EXISTS "logs_no_client"     ON server_logs;

-- Les admins peuvent lire les logs
CREATE POLICY "logs_admin_read" ON server_logs
  FOR SELECT USING (auth_user_role() = 'admin');

-- Aucun client ne peut écrire (service_role bypasse RLS)
CREATE POLICY "logs_no_client" ON server_logs
  FOR INSERT WITH CHECK (false);

-- Vue agrégée pour le dashboard admin (dernières 24h)
CREATE OR REPLACE VIEW logs_summary_24h AS
SELECT
  date_trunc('hour', ts)         AS hour,
  level,
  category,
  COUNT(*)                        AS count,
  COUNT(*) FILTER (WHERE status >= 500)  AS errors_5xx,
  COUNT(*) FILTER (WHERE status >= 400 AND status < 500) AS errors_4xx,
  ROUND(AVG(duration_ms))        AS avg_duration_ms
FROM server_logs
WHERE ts > now() - INTERVAL '24 hours'
GROUP BY 1, 2, 3
ORDER BY 1 DESC, 3;

-- Vue des dernières erreurs
CREATE OR REPLACE VIEW logs_recent_errors AS
SELECT id, ts, category, action, user_email, path, status, message, meta
FROM server_logs
WHERE level = 'error'
ORDER BY ts DESC
LIMIT 100;

COMMENT ON TABLE server_logs IS 'Logs structurés du backend NEXUS Market — écrits par service_role uniquement';
