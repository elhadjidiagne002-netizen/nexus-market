-- ════════════════════════════════════════════════════════════════════════════
--  NEXUS Market — ALERTE STOCK FAIBLE (vendeur)
--
--  AUDIT EMAIL (2026-06-16) : le template `low_stock` existait mais n'était
--  JAMAIS déclenché → le vendeur n'était jamais alerté. On câble un trigger sur
--  products qui se déclenche au FRANCHISSEMENT du seuil vers le bas (anti-spam) :
--  notif in-app (+ push) + email via /api/low-stock-email (pg_net, calqué sur
--  _order_confirm_email). Seuil = products.low_stock_threshold (défaut 3).
--  Idempotent.
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public._low_stock_alert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
declare
  v_threshold integer := COALESCE(NEW.low_stock_threshold, 3);
  v_secret    text;
  v_email     text;
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

  -- Email vendeur (best-effort, ne bloque jamais la mise à jour de stock).
  BEGIN
    SELECT decrypted_secret INTO v_secret
      FROM vault.decrypted_secrets WHERE name = 'nexus_internal_push_secret' LIMIT 1;
    SELECT email, name INTO v_email, v_name FROM profiles WHERE id = NEW.vendor_id;
    IF v_secret IS NOT NULL AND v_email IS NOT NULL THEN
      PERFORM net.http_post(
        url     := 'https://nexusmarket.sn/api/low-stock-email',
        headers := jsonb_build_object('Content-Type','application/json','X-Internal-Secret', v_secret),
        body    := jsonb_build_object('to', v_email, 'vendor_name', COALESCE(v_name,''),
                     'product_name', COALESCE(NEW.name,''), 'stock', NEW.stock),
        timeout_milliseconds := 5000);
    END IF;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  RETURN NEW;
end $$;

DROP TRIGGER IF EXISTS trg_low_stock_alert ON public.products;
CREATE TRIGGER trg_low_stock_alert AFTER UPDATE OF stock ON public.products
  FOR EACH ROW EXECUTE FUNCTION public._low_stock_alert();
