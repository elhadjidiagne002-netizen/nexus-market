-- ════════════════════════════════════════════════════════════════════════════
--  Filet forensique pour les épuisements de budget IO récurrents (incident
--  2026-06-26 et 2026-09-04) : pg_stat_statements / pg_stat_user_tables sont
--  RÉINITIALISÉS par un restart de compute (seul levier de déblocage quand
--  tout time out) — donc la prochaine fois qu'on cherche la requête coupable
--  APRÈS coup, les preuves ont disparu. Ce cron capture un instantané horaire
--  AVANT qu'un restart ne les efface, pour permettre un vrai diagnostic
--  la prochaine fois plutôt que de deviner.
--
--  Idempotent / rejouable. Appliqué en prod le 2026-09-04 (project_id
--  pqcqbstbdujzaclsiosv, via l'API Management — voir JOURNAL.md).
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.io_stats_snapshots (
  id        bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  taken_at  timestamptz NOT NULL DEFAULT now(),
  kind      text NOT NULL,      -- 'top_statements' | 'top_tables'
  payload   jsonb NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_io_stats_snapshots_taken_at ON public.io_stats_snapshots(taken_at);

CREATE OR REPLACE FUNCTION public.nexus_io_stats_snapshot()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
BEGIN
  INSERT INTO public.io_stats_snapshots (kind, payload)
  SELECT 'top_statements', COALESCE(jsonb_agg(t), '[]'::jsonb) FROM (
    SELECT left(query, 300) AS query, calls,
           round(total_exec_time::numeric,1) AS total_ms,
           shared_blks_read, shared_blks_hit
    FROM pg_stat_statements
    WHERE query NOT ILIKE '%pg_stat_statements%' AND query NOT ILIKE '%io_stats_snapshot%'
    ORDER BY shared_blks_read DESC
    LIMIT 15
  ) t;

  INSERT INTO public.io_stats_snapshots (kind, payload)
  SELECT 'top_tables', COALESCE(jsonb_agg(t), '[]'::jsonb) FROM (
    SELECT relname, n_tup_ins, n_tup_upd, n_tup_del, n_live_tup, n_dead_tup
    FROM pg_stat_user_tables
    ORDER BY (n_tup_ins + n_tup_upd + n_tup_del) DESC
    LIMIT 15
  ) t;

  -- Rétention 7 jours : assez pour couvrir un incident sans grossir sans fin.
  DELETE FROM public.io_stats_snapshots WHERE taken_at < now() - interval '7 days';
END;
$$;

SELECT cron.schedule('nexus-io-stats-snapshot', '0 * * * *', 'select public.nexus_io_stats_snapshot();');

ALTER TABLE public.io_stats_snapshots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS io_stats_snapshots_admin_only ON public.io_stats_snapshots;
CREATE POLICY io_stats_snapshots_admin_only ON public.io_stats_snapshots
  FOR SELECT USING (is_admin());
GRANT SELECT ON public.io_stats_snapshots TO authenticated;
GRANT EXECUTE ON FUNCTION public.nexus_io_stats_snapshot() TO authenticated, anon, service_role;

-- ════════════════════════════════════════════════════════════════════════════
--  Consultation (dashboard/SQL Editor) après le prochain incident :
--    SELECT taken_at, kind, payload FROM io_stats_snapshots
--     WHERE taken_at BETWEEN <début incident> AND <fin incident>
--     ORDER BY taken_at;
-- ════════════════════════════════════════════════════════════════════════════
