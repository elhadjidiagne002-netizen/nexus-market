-- ════════════════════════════════════════════════════════════════════════════
--  NEXUS Market — Email de confirmation : transmettre le DÉTAIL de la commande
--
--  Le trigger _order_confirm_email (AFTER INSERT orders) appelait /api/order-email
--  avec seulement to/order_id/buyer_name/total/vendor_email. Le template
--  configurable « order_confirmation » déclare aussi : order_date, address,
--  tracking, vendor_name, items (HTML). On enrichit donc le payload pour qu'un
--  template riche s'affiche entièrement (articles, adresse, date, suivi).
--
--  Le montant reste transmis BRUT (orders.total) ; la conversion en FCFA et le
--  formatage des articles se font côté /api/order-email (JS). Idempotent.
-- ════════════════════════════════════════════════════════════════════════════

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
        'to',              new.buyer_email,
        'order_id',        new.id::text,
        'buyer_name',      coalesce(new.buyer_name, ''),
        'total',           new.total,
        'vendor_email',    v_vendor_email,
        'vendor_name',     coalesce(new.vendor_name, ''),
        'buyer_address',   coalesce(new.buyer_address, ''),
        'shipping_city',   coalesce(new.shipping_city, ''),
        'tracking_number', coalesce(new.tracking_number, ''),
        'created_at',      new.created_at,
        'products',        coalesce(new.products, '[]'::jsonb)),
      timeout_milliseconds := 5000
    );
  exception when others then null; -- l'email ne doit JAMAIS bloquer la commande
  end;
  return new;
end $function$;
