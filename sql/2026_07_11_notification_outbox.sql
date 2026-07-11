-- ════════════════════════════════════════════════════════════════════════════
--  NEXUS Market — Outbox de notifications + retry différé (email + WhatsApp)
--
--  Comble le SEUL manque de la chaîne notify.js (le fallback Green API→WAHA et
--  l'envoi email+WhatsApp parallèle existent déjà) : le RETRY différé quand un
--  canal échoue (les DEUX providers WhatsApp KO, ou l'email KO).
--
--  Fonctionnement :
--   - sendEventNotification envoie d'abord immédiatement (faible latence).
--   - Si un canal échoue RÉELLEMENT (ok=false, ≠ skipped), il insère une ligne
--     ici avec le statut PAR CANAL (on ne rejoue que le canal encore en échec).
--   - Le cron GET /cron/notify-retry (cron-job.org, toutes les 5 min) réclame les
--     lignes dues via claim_notification_outbox() et rejoue les canaux 'pending'.
--   - Backoff 15 min → 1 h → 3 h → 6 h ; 5 essais max → status='failed' (dead-letter).
--
--  Idempotent (IF NOT EXISTS / CREATE OR REPLACE).
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.notification_outbox (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_key       text NOT NULL,
  recipient       jsonb NOT NULL DEFAULT '{}'::jsonb,   -- {email, phone, userId}
  vars            jsonb NOT NULL DEFAULT '{}'::jsonb,    -- variables de template
  email_status    text NOT NULL DEFAULT 'pending',      -- pending|sent|skipped|failed
  whatsapp_status text NOT NULL DEFAULT 'pending',      -- pending|sent|skipped|failed
  status          text NOT NULL DEFAULT 'pending',      -- pending|done|failed
  attempts        int  NOT NULL DEFAULT 0,
  max_attempts    int  NOT NULL DEFAULT 5,
  next_retry_at   timestamptz NOT NULL DEFAULT now(),
  last_error      text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- Index partiel : ne cible que les lignes en attente, triées par échéance.
CREATE INDEX IF NOT EXISTS idx_notif_outbox_due
  ON public.notification_outbox (next_retry_at)
  WHERE status = 'pending';

-- Réclame jusqu'à p_limit lignes dues, en évitant qu'un tick concurrent traite
-- les mêmes (FOR UPDATE SKIP LOCKED). Repousse next_retry_at de 10 min : fenêtre
-- de garde AUTO-CICATRISANTE — si le Worker plante en cours d'envoi, la ligne
-- redevient due 10 min plus tard (pas de statut 'processing' bloqué).
CREATE OR REPLACE FUNCTION public.claim_notification_outbox(p_limit int DEFAULT 25)
RETURNS SETOF public.notification_outbox
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  UPDATE public.notification_outbox o
     SET next_retry_at = now() + interval '10 minutes', updated_at = now()
   WHERE o.id IN (
     SELECT id FROM public.notification_outbox
      WHERE status = 'pending' AND next_retry_at <= now() AND attempts < max_attempts
      ORDER BY next_retry_at
      LIMIT p_limit
      FOR UPDATE SKIP LOCKED
   )
  RETURNING o.*;
END;
$function$;

-- Écrite/lue uniquement par la service key (server-only). Pas d'accès client.
REVOKE ALL ON public.notification_outbox FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_notification_outbox(int) FROM PUBLIC, anon, authenticated;
