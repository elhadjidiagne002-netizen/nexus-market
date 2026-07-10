-- [FIX] nexus_send_whatsapp() appelait https://nexus.sn/api/whatsapp — ancien
-- domaine, 404 confirmé en prod (le site a basculé sur nexusmarket.sn, cf.
-- memory domaine-nexusmarket-sn.md). Ce trigger/RPC était donc muet depuis la
-- bascule de domaine : toute notification WhatsApp déclenchée côté DB
-- (triggers orders, etc.) échouait silencieusement (capturé par le EXCEPTION
-- WHEN OTHERS existant, donc invisible sans lire whatsapp_logs.error_msg).
CREATE OR REPLACE FUNCTION public.nexus_send_whatsapp(p_phone text, p_message text, p_template text DEFAULT NULL::text, p_user_id uuid DEFAULT NULL::uuid, p_context jsonb DEFAULT NULL::jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_cfg       whatsapp_config%ROWTYPE;
  v_log_id    uuid := gen_random_uuid();
BEGIN
  -- Récupérer la config
  SELECT * INTO v_cfg FROM whatsapp_config WHERE id = 1;

  -- Logger l'intention
  INSERT INTO whatsapp_logs (id, phone, message, template, status, user_id, context)
  VALUES (v_log_id, p_phone, left(p_message, 1000), p_template, 'pending', p_user_id, p_context);

  -- Ne rien envoyer si Green API non configuré ou désactivé
  IF v_cfg.instance_id IS NULL OR v_cfg.api_token IS NULL OR NOT v_cfg.enabled THEN
    UPDATE whatsapp_logs SET status = 'skipped', error_msg = 'Green API non configuré'
    WHERE id = v_log_id;
    RETURN;
  END IF;

  -- Appel HTTP via pg_net
  PERFORM net.http_post(
    url     := 'https://nexusmarket.sn/api/whatsapp',
    body    := jsonb_build_object(
                 'phone',    p_phone,
                 'message',  p_message,
                 'template', p_template,
                 'secret',   v_cfg.wa_secret
               )::text,
    headers := '{"Content-Type": "application/json"}'::jsonb
  );

  -- Marquer comme envoyé (pg_net est asynchrone, on n'attend pas la réponse)
  UPDATE whatsapp_logs SET status = 'sent' WHERE id = v_log_id;

EXCEPTION WHEN OTHERS THEN
  UPDATE whatsapp_logs
  SET status = 'failed', error_msg = SQLERRM
  WHERE id = v_log_id;
END; $function$;
