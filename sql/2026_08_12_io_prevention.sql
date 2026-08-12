-- ============================================================================
-- PRÉVENTION Disk IO — rend la base AUTO-NETTOYANTE pour ne plus atteindre le mur.
-- 1) Fonction nexus_io_housekeeping() planifiée toutes les heures :
--    - auto-expire les dispatches morts (sinon re-scannés à vide en boucle),
--    - purge les tables-journaux qui grossissent sans fin (notifications, logs comm).
-- 2) Reclaim ponctuel de server_logs (0 ligne mais ~10 Mo de bloat mort).
-- Idempotent (relançable). Complète sql/2026_08_12_io_maintenance.sql (curatif).
-- ============================================================================

create or replace function public.nexus_io_housekeeping()
returns void language plpgsql security definer set search_path = public as $$
begin
  -- Dispatches morts : une seule livraison « searching/no_courier » qui traîne suffit
  -- à faire travailler le cron à chaque tick. On les clôt au-delà d'1 h.
  update public.deliveries
     set status = 'cancelled', notes = coalesce(notes,'') || ' [auto-expiré: aucun coursier]'
   where status in ('searching','no_courier') and created_at < now() - interval '1 hour';
  update public.rescue_requests
     set status = 'cancelled', cancelled_at = now()
   where status in ('searching','no_rescuer') and created_at < now() - interval '1 hour';

  -- Notifications : table append-only qui grossit à chaque événement. On garde 45 j,
  -- et on retire les lues au bout de 7 j.
  delete from public.notifications where created_at < now() - interval '45 days';
  delete from public.notifications where read = true and created_at < now() - interval '7 days';

  -- Journaux de communication : rétention 90 j.
  delete from public.email_logs    where created_at < now() - interval '90 days';
  delete from public.whatsapp_logs where created_at < now() - interval '90 days';
  delete from public.sms_logs      where sent_at    < now() - interval '90 days';

  -- Journal serveur (audit HTTP) : rétention 30 j.
  delete from public.server_logs   where created_at < now() - interval '30 days';
end $$;

grant execute on function public.nexus_io_housekeeping() to service_role;

-- Planification horaire (upsert par nom → relançable sans doublon).
select cron.schedule('nexus-io-housekeeping', '20 * * * *',
  'select public.nexus_io_housekeeping();');

-- Passe immédiate.
select public.nexus_io_housekeeping();

-- ── Contrôle ────────────────────────────────────────────────────────────────
select relname, to_char(n_live_tup,'999G999') rows, pg_size_pretty(pg_total_relation_size(('public.'||relname)::regclass)) size, n_dead_tup dead
  from pg_stat_user_tables where schemaname='public'
 order by pg_total_relation_size(('public.'||relname)::regclass) desc limit 8;

-- ════════════════════════════════════════════════════════════════════════════
-- ⚠️ À LANCER SÉPARÉMENT (une ligne à la fois, PAS avec le bloc ci-dessus) :
--    VACUUM ne peut pas tourner dans une transaction. Reclaim ponctuel du bloat.
-- ════════════════════════════════════════════════════════════════════════════
-- vacuum full public.server_logs;   -- 0 ligne / ~10 Mo → instantané, verrou bref
-- vacuum (analyze) public.profiles; -- ~512 lignes mortes (updates de la session)
-- vacuum (analyze) public.pros;
