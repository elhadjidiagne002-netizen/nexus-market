-- ============================================================================
-- Migration : URL du trigger push -> domaine custom nexusmarket.sn
-- _push_on_notification appelait l'ancienne URL en dur (nexus-market-asb.pages.dev).
-- Fonctionne (CF sert les deux), mais on aligne sur le domaine de prod.
-- Seule la ligne v_site change. Idempotent (CREATE OR REPLACE).
-- ============================================================================
CREATE OR REPLACE FUNCTION public._push_on_notification()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  v_secret text;
  v_site   text := 'https://nexusmarket.sn';
begin
  begin
    select decrypted_secret into v_secret
      from vault.decrypted_secrets where name = 'nexus_internal_push_secret' limit 1;
    if v_secret is null or new.user_id is null then return new; end if;
    perform net.http_post(
      url     := v_site || '/push-send',
      headers := jsonb_build_object('Content-Type','application/json','X-Internal-Secret', v_secret),
      body    := jsonb_build_object(
        'userId', new.user_id::text,
        'title',  coalesce(nullif(new.title,''), 'NEXUS Market'),
        'body',   coalesce(nullif(new.message,''), new.title, ''),
        'url',    coalesce(nullif(new.link,''), '/')),
      timeout_milliseconds := 5000
    );
  exception when others then null; -- le push ne doit JAMAIS bloquer l'insert
  end;
  return new;
end $function$;
