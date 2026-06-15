-- ============================================================================
-- create_order_atomic : notifier le VENDEUR côté serveur à chaque commande.
--
-- Avant, la notif "nouvelle commande" était créée côté CLIENT (addNotification ->
-- /api/notifications) : pour un checkout INVITÉ (acheteur non connecté), pas de
-- session -> 401 -> aucune notification créée -> le vendeur ne recevait rien
-- (ni in-app ni push). On la crée donc dans la RPC (SECURITY DEFINER), de façon
-- best-effort (ne bloque jamais la commande). L'INSERT dans notifications
-- déclenche trg_push_on_notification -> Web Push automatique vers le vendeur.
-- Reste identique au reste de la fonction.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.create_order_atomic(items_json text, order_json text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _o        JSONB := order_json::jsonb;
  _items    JSONB := COALESCE(items_json::jsonb, '[]'::jsonb);
  _item     JSONB;
  _pid      TEXT;
  _qty      INT;
  _row      orders%ROWTYPE;
BEGIN
  -- Verif + decrement du stock (atomique grace au WHERE stock >= qty)
  FOR _item IN SELECT * FROM jsonb_array_elements(_items)
  LOOP
    _pid := _item->>'id';
    _qty := COALESCE((_item->>'quantity')::INT, 1);
    IF _pid IS NULL THEN CONTINUE; END IF;

    UPDATE products
       SET stock = stock - _qty
     WHERE id::text = _pid
       AND stock >= _qty;

    IF NOT FOUND THEN
      IF EXISTS (SELECT 1 FROM products WHERE id::text = _pid) THEN
        RAISE EXCEPTION 'STOCK_INSUFFICIENT:%', COALESCE(_item->>'name', _pid);
      END IF;
      -- produit introuvable (custom/legacy) -> on n'impose pas de stock
    END IF;
  END LOOP;

  INSERT INTO orders (
    buyer_id, buyer_name, buyer_email, buyer_address, buyer_phone,
    vendor_id, vendor_name, products, subtotal, total, commission,
    status, payment_method, shipping_city, tracking_number, stripe_payment_id
  ) VALUES (
    NULLIF(_o->>'buyer','')::uuid,
    _o->>'buyerName',
    _o->>'buyerEmail',
    _o->>'buyerAddress',
    _o->>'buyerPhone',
    NULLIF(_o->>'vendor','')::uuid,
    _o->>'vendorName',
    COALESCE(_o->'products', '[]'::jsonb),
    NULLIF(_o->>'subtotal','')::numeric,
    NULLIF(_o->>'total','')::numeric,
    NULLIF(_o->>'commission','')::numeric,
    COALESCE(NULLIF(_o->>'status',''), 'processing'),
    _o->>'paymentMethod',
    _o->>'shippingCity',
    _o->>'trackingNumber',
    _o->>'stripePaymentId'
  )
  RETURNING * INTO _row;

  -- [NOTIF SERVEUR] Notifier le vendeur (in-app + push via trigger), indépendamment
  -- de l'auth de l'acheteur (checkout invité). Best-effort : ne bloque jamais.
  IF _row.vendor_id IS NOT NULL THEN
    BEGIN
      INSERT INTO notifications (id, user_id, type, title, message, link, read, created_at)
      VALUES (
        gen_random_uuid(), _row.vendor_id, 'order',
        'Nouvelle commande reçue',
        'Vous avez reçu une nouvelle commande sur NEXUS Market.',
        '/?order=' || _row.id::text, false, now()
      );
    EXCEPTION WHEN others THEN NULL;
    END;
  END IF;

  RETURN to_jsonb(_row);

EXCEPTION
  WHEN others THEN
    IF SQLERRM LIKE 'STOCK_INSUFFICIENT%' THEN
      RAISE EXCEPTION '%', SQLERRM;
    END IF;
    RAISE;
END;
$function$;
