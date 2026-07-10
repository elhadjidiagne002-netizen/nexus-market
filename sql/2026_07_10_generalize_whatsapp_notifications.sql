-- ════════════════════════════════════════════════════════════════════════════
--  NEXUS Market — Généralisation WhatsApp : partout où un email serveur est
--  envoyé, le message WhatsApp équivalent part désormais aussi (si un
--  téléphone est disponible et qu'un fournisseur WhatsApp est configuré).
--
--  Ce fichier ajoute buyer_phone / vendor_phone / phone aux payloads envoyés
--  par les triggers DB vers /api/order-email, /api/offer-email et
--  /api/low-stock-email — ces trois endpoints ont été mis à jour côté code
--  (sendEventNotification) pour utiliser ces champs et envoyer aussi un
--  WhatsApp (cf. functions/api/_lib/notify.js, sendEventWhatsApp/WA_DEFAULTS).
--
--  Idempotent (CREATE OR REPLACE, les triggers restent attachés).
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. Confirmation de commande (acheteur) + nouvelle commande (vendeur) ─────
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
  v_vendor_phone text;
begin
  begin
    select decrypted_secret into v_secret
      from vault.decrypted_secrets where name = 'nexus_internal_push_secret' limit 1;
    if v_secret is null or (
      (new.buyer_email is null or new.buyer_email = '') and
      (new.buyer_phone is null or new.buyer_phone = '')
    ) then
      return new;
    end if;
    if new.vendor_id is not null then
      select email, phone into v_vendor_email, v_vendor_phone from profiles where id = new.vendor_id;
    end if;
    perform net.http_post(
      url     := v_site || '/api/order-email',
      headers := jsonb_build_object('Content-Type','application/json','X-Internal-Secret', v_secret),
      body    := jsonb_build_object(
        'to',              new.buyer_email,
        'buyer_phone',     coalesce(new.buyer_phone, ''),
        'order_id',        new.id::text,
        'buyer_name',      coalesce(new.buyer_name, ''),
        'total',           new.total,
        'vendor_email',    v_vendor_email,
        'vendor_phone',    v_vendor_phone,
        'vendor_name',     coalesce(new.vendor_name, ''),
        'buyer_address',   coalesce(new.buyer_address, ''),
        'shipping_city',   coalesce(new.shipping_city, ''),
        'tracking_number', coalesce(new.tracking_number, ''),
        'created_at',      new.created_at,
        'products',        coalesce(new.products, '[]'::jsonb)),
      timeout_milliseconds := 5000
    );
  exception when others then null; -- la notification ne doit JAMAIS bloquer la commande
  end;
  return new;
end $function$;

-- ── 2. Offres / demandes d'achat sur une story ────────────────────────────────
CREATE OR REPLACE FUNCTION public._offer_emails()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
declare
  v_secret       text;
  v_site         text := 'https://nexusmarket.sn';
  v_vendor_email text;
  v_vendor_phone text;
begin
  if new.story_id is null then return new; end if;
  begin
    select decrypted_secret into v_secret
      from vault.decrypted_secrets where name = 'nexus_internal_push_secret' limit 1;
    if v_secret is null then return new; end if;
    if new.vendor_id is not null then
      select email, phone into v_vendor_email, v_vendor_phone from profiles where id = new.vendor_id;
    end if;
    perform net.http_post(
      url     := v_site || '/api/offer-email',
      headers := jsonb_build_object('Content-Type','application/json','X-Internal-Secret', v_secret),
      body    := jsonb_build_object(
        'kind',         new.kind,
        'offer_id',     new.id::text,
        'story_title',  coalesce(new.product_name, ''),
        'buyer_name',   coalesce(new.buyer_name, ''),
        'buyer_phone',  coalesce(new.buyer_phone, ''),
        'buyer_email',  new.buyer_email,
        'amount',       new.offered_price,
        'message',      coalesce(new.message, ''),
        'vendor_email', v_vendor_email,
        'vendor_phone', v_vendor_phone),
      timeout_milliseconds := 5000
    );
  exception when others then null; -- la notification ne doit jamais bloquer l'offre
  end;
  return new;
end $function$;

-- ── 3. Stock faible (vendeur) ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public._low_stock_alert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
declare
  v_threshold integer := COALESCE(NEW.low_stock_threshold, 3);
  v_secret    text;
  v_email     text;
  v_phone     text;
  v_name      text;
begin
  -- Ne fire qu'au passage SOUS le seuil (NEW bas, OLD au-dessus) → pas de spam.
  if NEW.stock IS NULL OR NEW.stock > v_threshold THEN RETURN NEW; END IF;
  if OLD.stock IS NOT NULL AND OLD.stock <= v_threshold THEN RETURN NEW; END IF;
  if NEW.stock = OLD.stock THEN RETURN NEW; END IF;
  if NEW.vendor_id IS NULL THEN RETURN NEW; END IF;

  -- Notification in-app vendeur (push auto via trg_push_on_notification).
  BEGIN
    INSERT INTO public.notifications (user_id, type, title, message, link, read)
    VALUES (NEW.vendor_id, 'vendor', '📉 Stock faible',
            COALESCE(NEW.name, 'Un produit') || ' : ' || NEW.stock || ' restant(s)', '/', false);
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  -- Email + WhatsApp vendeur (best-effort, ne bloque jamais la mise à jour de stock).
  BEGIN
    SELECT decrypted_secret INTO v_secret
      FROM vault.decrypted_secrets WHERE name = 'nexus_internal_push_secret' LIMIT 1;
    SELECT email, phone, name INTO v_email, v_phone, v_name FROM profiles WHERE id = NEW.vendor_id;
    IF v_secret IS NOT NULL AND (v_email IS NOT NULL OR v_phone IS NOT NULL) THEN
      PERFORM net.http_post(
        url     := 'https://nexusmarket.sn/api/low-stock-email',
        headers := jsonb_build_object('Content-Type','application/json','X-Internal-Secret', v_secret),
        body    := jsonb_build_object('to', v_email, 'phone', v_phone, 'vendor_name', COALESCE(v_name,''),
                     'product_name', COALESCE(NEW.name,''), 'stock', NEW.stock),
        timeout_milliseconds := 5000);
    END IF;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  RETURN NEW;
end $function$;
