-- ════════════════════════════════════════════════════════════════════════════
--  NEXUS Market — WEB PUSH AUTOMATIQUE SUR CHAQUE NOTIFICATION (trigger pg_net)
--
--  PROBLÈME (2026-06-12) : « pas de notification de proposition de course en
--  tant que coursier ». Le tick de dispatch tourne désormais via pg_cron (SQL
--  pur) → il insère bien la notification in-app, mais RIEN n'envoyait le Web
--  Push (l'envoi HTTP n'existait que dans le worker /cron/dispatch, dont le
--  schedule GitHub était throttlé/mort).
--
--  SOLUTION : un trigger AFTER INSERT sur public.notifications appelle
--  /push-send (Cloudflare) via pg_net, avec le secret interne lu dans
--  Supabase Vault. AINSI : toute notification in-app — offre de course,
--  commande, message, litige… — déclenche AUSSI le push (ordinateur +
--  smartphone, app fermée), quelle que soit son origine (RPC dispatch,
--  pg_cron, endpoint /api/notifications, SQL admin).
--
--  ⚠️ /api/notifications (functions/api/notifications.js) n'envoie PLUS de
--  push lui-même : ce trigger est LA source unique (sinon doublon).
--
--  PRÉREQUIS (une fois, avec un secret réel — JAMAIS commité) :
--    select vault.create_secret('<X-Internal-Secret accepté par /push-send :
--      INTERNAL_API_SECRET, CRON_SECRET ou SUPABASE_SERVICE_KEY>',
--      'nexus_internal_push_secret');
--  (DÉJÀ FAIT sur la base déployée le 2026-06-12.)
--
--  Si le domaine change : mettre à jour v_site ci-dessous.
--  Idempotent. À exécuter dans Supabase → SQL Editor.
-- ════════════════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE OR REPLACE FUNCTION public._push_on_notification()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions
AS $fn$
DECLARE
  v_secret text;
  v_site   text := 'https://nexus-market-asb.pages.dev';
BEGIN
  BEGIN
    SELECT decrypted_secret INTO v_secret
      FROM vault.decrypted_secrets WHERE name = 'nexus_internal_push_secret' LIMIT 1;
    IF v_secret IS NULL OR new.user_id IS NULL THEN RETURN new; END IF;
    PERFORM net.http_post(
      url     := v_site || '/push-send',
      headers := jsonb_build_object('Content-Type','application/json','X-Internal-Secret', v_secret),
      body    := jsonb_build_object(
        'userId', new.user_id::text,
        'title',  COALESCE(NULLIF(new.title,''), 'NEXUS Market'),
        'body',   COALESCE(NULLIF(new.message,''), new.title, ''),
        'url',    COALESCE(NULLIF(new.link,''), '/')),
      timeout_milliseconds := 5000
    );
  EXCEPTION WHEN OTHERS THEN NULL;  -- le push ne doit JAMAIS bloquer l'insert
  END;
  RETURN new;
END $fn$;

DROP TRIGGER IF EXISTS trg_push_on_notification ON public.notifications;
CREATE TRIGGER trg_push_on_notification
  AFTER INSERT ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public._push_on_notification();

-- Vérification (après un INSERT de test dans notifications) :
--   SELECT id, status_code, left(content, 80) FROM net._http_response ORDER BY id DESC LIMIT 3;
--   → status_code 200 et {"sent":N} attendu.
