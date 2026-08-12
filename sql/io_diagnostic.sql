-- ============================================================================
-- DIAGNOSTIC Disk IO — LECTURE SEULE. À coller dans Supabase → SQL Editor quand un
-- warning IO apparaît (ou en check périodique). Ne modifie rien.
-- Remédiation : sql/2026_08_12_io_maintenance.sql · Prévention : sql/2026_08_12_io_prevention.sql
-- ============================================================================

-- 1) Top requêtes par lectures disque (les vraies coupables).
select substring(regexp_replace(query,'\s+',' ','g') for 90) as q,
       calls, round(total_exec_time::numeric,0) as total_ms,
       shared_blks_read as disk_reads, round((shared_blks_read/greatest(calls,1))::numeric,1) as reads_per_call
  from pg_stat_statements
 order by shared_blks_read desc limit 10;

-- 2) Crons planifiés (fréquence = source d'IO de fond).
select jobid, schedule, active, substring(command for 60) as command from cron.job order by jobid;

-- 3) Volume du journal cron (doit rester petit grâce à la purge quotidienne).
select count(*) as cron_logs,
       pg_size_pretty(pg_total_relation_size('cron.job_run_details')) as taille
  from cron.job_run_details;

-- 4) Dispatches bloqués (font tourner les ticks à vide — doivent être 0).
select 'deliveries' as t, count(*) from public.deliveries where status in ('searching','no_courier')
 union all select 'rescue_requests', count(*) from public.rescue_requests where status in ('searching','no_rescuer');

-- 5) Tables les plus lourdes + lignes mortes (candidates VACUUM / purge).
select relname, to_char(n_live_tup,'999G999G999') as rows,
       pg_size_pretty(pg_total_relation_size(('public.'||relname)::regclass)) as size,
       n_dead_tup as dead
  from pg_stat_user_tables where schemaname='public'
 order by pg_total_relation_size(('public.'||relname)::regclass) desc limit 12;

-- 6) Ratio cache (un cache_hit_ratio bas = trop de lectures disque = compute sous-dimensionné).
select round(sum(shared_blks_hit) * 100.0 / greatest(sum(shared_blks_hit)+sum(shared_blks_read),1), 2) as cache_hit_pct
  from pg_stat_statements;
