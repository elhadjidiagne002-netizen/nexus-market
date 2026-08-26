-- ============================================================================
-- Message de bienvenue (email + WhatsApp) AUTOMATIQUE après CHAQUE approbation
-- de compte vendeur — quel que soit le chemin admin qui a fait l'UPDATE
-- (RPC admin_approve_user OU fallback UPDATE direct des deux panneaux admin).
-- Trigger DB plutôt que logique client : source de vérité unique, ne peut pas
-- être oublié dans un 3e écran d'admin plus tard. Même pattern que
-- trg_order_confirm_email (sql/2026_06_15_order_confirm_email_trigger.sql).
--
-- Événement 'vendor_approved' : templates déjà existants (email + WhatsApp)
-- dans functions/api/_lib/notify.js, déclenchés via POST /api/notify-user
-- (désormais accessible en interne via X-Internal-Secret, cf. la modif de
-- functions/api/notify-user.js du même jour — isInternalCall en plus de
-- requireAuth, sans rien changer au comportement existant côté client).
-- ============================================================================

CREATE OR REPLACE FUNCTION public._vendor_approved_notify()
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
    if new.email is null and new.phone is null then
      return new;
    end if;
    select decrypted_secret into v_secret
      from vault.decrypted_secrets where name = 'nexus_internal_push_secret' limit 1;
    if v_secret is null then
      return new;
    end if;
    perform net.http_post(
      url     := v_site || '/api/notify-user',
      headers := jsonb_build_object('Content-Type','application/json','X-Internal-Secret', v_secret),
      body    := jsonb_build_object(
        'event', 'vendor_approved',
        'userId', new.id::text,
        'vars', jsonb_build_object(
          'vendor_name', coalesce(new.name, ''),
          'shop_name',   coalesce(new.shop_name, new.name, '')
        )
      ),
      timeout_milliseconds := 5000
    );
  exception when others then null; -- best-effort : ne doit JAMAIS bloquer l'approbation
  end;
  return new;
end $function$;

DROP TRIGGER IF EXISTS trg_vendor_approved_notify ON public.profiles;
CREATE TRIGGER trg_vendor_approved_notify
  AFTER UPDATE ON public.profiles
  FOR EACH ROW
  WHEN (NEW.role = 'vendor' AND NEW.status = 'approved' AND OLD.status IS DISTINCT FROM 'approved')
  EXECUTE FUNCTION public._vendor_approved_notify();
