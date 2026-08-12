-- ============================================================================
-- MAINTENANCE Disk IO — Supabase (projet pqcqbstbdujzaclsiosv).
-- À lancer dans le SQL Editor quand le budget Disk IO est bas.
-- Cause principale : cron.job_run_details qui gonfle (pg_cron journalise chaque run)
-- + cron dépannage à chaque minute + livraisons « no_courier » re-scannées à vide.
-- Idempotent (relançable). Si l'IO est DÉJÀ à sec (site qui time out) : redémarrer le
-- compute (dashboard → Settings → Compute → Restart) AVANT de lancer ceci.
-- ============================================================================

-- 1) PURGE du journal cron (le gros gain : ~12 Mo / dizaines de milliers de lignes
--    re-scannées en boucle). Le rôle postgres a bien le DELETE (vérifié).
delete from cron.job_run_details where end_time < now() - interval '1 day';

-- 2) PURGE QUOTIDIENNE automatique (évite que le journal regonfle). cron.schedule
--    fait un upsert par nom → relançable sans doublon.
select cron.schedule('purge-cron-logs', '0 3 * * *',
  $$delete from cron.job_run_details where end_time < now() - interval '2 days'$$);

-- 3) Cron dépannage : chaque-minute → toutes-les-3-min (comme le coursier). On passe par
--    les FONCTIONS pg_cron (UPDATE direct sur cron.job = permission denied). Idempotent :
--    on retire tout cron rescue à la minute, puis on (re)crée la version */3.
do $$
declare j bigint;
begin
  for j in select jobid from cron.job
            where command ilike '%rescue_dispatch_tick_all%' and schedule = '* * * * *'
  loop
    perform cron.unschedule(j);
  end loop;
end $$;
select cron.schedule('rescue-dispatch-tick', '*/3 * * * *',
  'select public.rescue_dispatch_tick_all();');

-- 4) Livraisons bloquées en searching/no_courier (le dispatch les re-scanne à vide).
--    deliveries n'a PAS de cancelled_at/cancel_reason : on met status='cancelled' + note.
update public.deliveries
   set status = 'cancelled',
       notes = coalesce(notes,'') || ' [annulé: dispatch expiré - nettoyage IO]'
 where status in ('searching','no_courier')
   and created_at < now() - interval '1 hour';

-- Idem côté dépannage (rescue_requests, si des demandes traînent).
update public.rescue_requests
   set status = 'cancelled', cancelled_at = now()
 where status in ('searching','no_rescuer')
   and created_at < now() - interval '1 hour';

-- ── Contrôle après coup ──────────────────────────────────────────────────────
select 'cron_logs_restants' as k, count(*)::text v from cron.job_run_details
 union all select 'deliveries_bloquees', count(*)::text from public.deliveries where status in ('searching','no_courier')
 union all select 'rescue_bloquees', count(*)::text from public.rescue_requests where status in ('searching','no_rescuer')
 union all select 'crons_actifs', string_agg(jobid||':'||schedule, ', ') from cron.job where active;
