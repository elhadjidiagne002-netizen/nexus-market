-- ============================================================================
-- Email de confirmation de commande ACHETEUR, côté serveur (checkout invité inclus).
--
-- Comme la notif push, on déclenche l'email via un trigger DB + pg_net qui appelle
-- l'endpoint interne /api/order-email (X-Internal-Secret). Indépendant de l'auth
-- de l'acheteur (le client en invité reçoit 401 sur /api/email/send par design).
-- Événement 'order_confirmed' (distinct de 'payment_received' envoyé au paiement)
-- -> pas de double envoi. Best-effort : ne bloque JAMAIS la création de commande.
-- ============================================================================
CREATE OR REPLACE FUNCTION public._order_confirm_email()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  v_secret       text;
  v_site         text := 'https://nexusmarket.sn';
  v_vendor_email text;
begin
  begin
    select decrypted_secret into v_secret
      from vault.decrypted_secrets where name = 'nexus_internal_push_secret' limit 1;
    if v_secret is null or new.buyer_email is null or new.buyer_email = '' then
      return new;
    end if;
    if new.vendor_id is not null then
      select email into v_vendor_email from profiles where id = new.vendor_id;
    end if;
    perform net.http_post(
      url     := v_site || '/api/order-email',
      headers := jsonb_build_object('Content-Type','application/json','X-Internal-Secret', v_secret),
      body    := jsonb_build_object(
        'to',           new.buyer_email,
        'order_id',     new.id::text,
        'buyer_name',   coalesce(new.buyer_name, ''),
        'total',        new.total,
        'vendor_email', v_vendor_email),
      timeout_milliseconds := 5000
    );
  exception when others then null; -- l'email ne doit JAMAIS bloquer la commande
  end;
  return new;
end $function$;

DROP TRIGGER IF EXISTS trg_order_confirm_email ON public.orders;
CREATE TRIGGER trg_order_confirm_email
  AFTER INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public._order_confirm_email();
