-- ════════════════════════════════════════════════════════════════════════════
--  NEXUS Market — CORRECTIF MAJEUR : courier_id = identifiant UTILISATEUR
--
--  CAUSE DU 409 (Conflict) à l'attribution :
--  Les politiques RLS de la base comparent `courier_id = auth.uid()`
--  (deliveries_select / deliveries_update / delivery_offers). La colonne
--  `deliveries.courier_id` (et `delivery_offers.courier_id`) doit donc contenir
--  l'ID UTILISATEUR (auth.uid() = profiles.id = couriers.user_id), et sa
--  contrainte de clé étrangère pointe vers les utilisateurs/profils — PAS vers
--  couriers.id. On stockait couriers.id → violation FK → 409.
--
--  Ce script réécrit TOUT le dispatch pour utiliser l'ID UTILISATEUR partout,
--  et ajoute la consultation des « courses disponibles » par les livreurs.
--
--  Idempotent. À exécuter dans Supabase → SQL Editor APRÈS les migrations
--  dispatch précédentes (il remplace les fonctions par les versions correctes).
-- ════════════════════════════════════════════════════════════════════════════

SET search_path = public, extensions;

-- ════════════════════════════════════════════════════════════════════════════
--  _activate_next_offer : file basée sur l'ID UTILISATEUR du coursier.
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public._activate_next_offer(p_delivery_id uuid, p_duree_s integer DEFAULT 45)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
  v_off RECORD; v_c RECORD;
  v_plat double precision; v_plng double precision; v_guard integer := 0;
BEGIN
  -- Anti-doublon : une offre déjà active ? on la renvoie.
  SELECT o.* INTO v_off FROM public.delivery_offers o
   WHERE o.delivery_id = p_delivery_id AND o.status = 'pending' ORDER BY o.seq ASC LIMIT 1;
  IF FOUND THEN
    SELECT c.user_id, c.name, c.phone INTO v_c FROM public.couriers c WHERE c.user_id = v_off.courier_id;
    RETURN jsonb_build_object('courier_id', v_off.courier_id, 'user_id', v_off.courier_id,
                              'name', v_c.name, 'phone', v_c.phone, 'distance_km', v_off.distance_km);
  END IF;

  LOOP
    v_guard := v_guard + 1; IF v_guard > 80 THEN EXIT; END IF;

    SELECT o.* INTO v_off FROM public.delivery_offers o
     WHERE o.delivery_id = p_delivery_id AND o.status = 'queued' ORDER BY o.seq ASC LIMIT 1;

    IF NOT FOUND THEN
      SELECT pickup_lat, pickup_lng INTO v_plat, v_plng FROM public.deliveries WHERE id = p_delivery_id;
      IF v_plat IS NOT NULL THEN
        INSERT INTO public.delivery_offers (delivery_id, courier_id, distance_km, status, seq)
        SELECT p_delivery_id, n.user_id, n.distance_km, 'queued',
               COALESCE((SELECT MAX(seq) FROM public.delivery_offers WHERE delivery_id = p_delivery_id), -1)
                 + ROW_NUMBER() OVER (ORDER BY n.distance_km)
        FROM public.nearby_couriers(v_plat, v_plng, 12000, 20) n
        WHERE n.user_id NOT IN (SELECT courier_id FROM public.delivery_offers WHERE delivery_id = p_delivery_id);
        SELECT o.* INTO v_off FROM public.delivery_offers o
         WHERE o.delivery_id = p_delivery_id AND o.status = 'queued' ORDER BY o.seq ASC LIMIT 1;
      END IF;
    END IF;

    IF NOT FOUND THEN
      UPDATE public.deliveries SET status = 'no_courier' WHERE id = p_delivery_id AND status = 'searching';
      RETURN NULL;
    END IF;

    -- Coursier encore disponible ? (v_off.courier_id = user_id)
    SELECT c.user_id, c.name, c.phone, c.is_available, c.status
      INTO v_c FROM public.couriers c WHERE c.user_id = v_off.courier_id;
    IF NOT FOUND OR v_c.is_available IS NOT TRUE OR v_c.status <> 'active' THEN
      UPDATE public.delivery_offers SET status = 'expired', responded_at = now() WHERE id = v_off.id;
      CONTINUE;
    END IF;

    UPDATE public.delivery_offers
       SET status = 'pending', offered_at = now(), expires_at = now() + make_interval(secs => GREATEST(p_duree_s, 10))
     WHERE id = v_off.id;
    UPDATE public.deliveries SET status = 'searching' WHERE id = p_delivery_id AND status = 'no_courier';

    RETURN jsonb_build_object('courier_id', v_off.courier_id, 'user_id', v_off.courier_id,
                              'name', v_c.name, 'phone', v_c.phone, 'distance_km', v_off.distance_km);
  END LOOP;
  RETURN NULL;
END;
$$;

-- ════════════════════════════════════════════════════════════════════════════
--  _free_courier_offers : keyé sur l'ID UTILISATEUR.
--  (param renommé p_courier_id → p_user_id : CREATE OR REPLACE ne peut pas
--   renommer un paramètre → on supprime d'abord l'ancienne version.)
-- ════════════════════════════════════════════════════════════════════════════
DROP FUNCTION IF EXISTS public._free_courier_offers(uuid, uuid);
CREATE OR REPLACE FUNCTION public._free_courier_offers(p_user_id uuid, p_except uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT o.delivery_id, bool_or(o.status = 'pending') AS was_active
      FROM public.delivery_offers o
      JOIN public.deliveries d ON d.id = o.delivery_id
     WHERE o.courier_id = p_user_id AND o.status IN ('pending','queued')
       AND o.delivery_id <> COALESCE(p_except, '00000000-0000-0000-0000-000000000000'::uuid)
       AND d.status = 'searching' AND d.courier_id IS NULL
     GROUP BY o.delivery_id
  LOOP
    UPDATE public.delivery_offers SET status = 'expired', responded_at = now()
     WHERE delivery_id = r.delivery_id AND courier_id = p_user_id AND status IN ('pending','queued');
    IF r.was_active THEN PERFORM public._activate_next_offer(r.delivery_id, 45); END IF;
  END LOOP;
END;
$$;

-- ════════════════════════════════════════════════════════════════════════════
--  create_delivery : offres keyées sur l'ID UTILISATEUR.
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.create_delivery(payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
  v_id uuid;
  v_plat double precision := NULLIF(payload->>'pickup_lat','')::double precision;
  v_plng double precision := NULLIF(payload->>'pickup_lng','')::double precision;
  v_active jsonb := NULL; v_row deliveries%ROWTYPE;
BEGIN
  INSERT INTO public.deliveries (
    buyer_id, buyer_name, buyer_phone, order_id, type, status,
    pickup_zone, pickup_label, pickup_lat, pickup_lng,
    dropoff_zone, dropoff_label, dropoff_lat, dropoff_lng,
    items_desc, distance_km, fee_fcfa, courier_payout, commission_fcfa, payment_method
  ) VALUES (
    NULLIF(payload->>'buyer_id','')::uuid, payload->>'buyer_name', payload->>'buyer_phone',
    NULLIF(payload->>'order_id','')::uuid, COALESCE(NULLIF(payload->>'type',''), 'errand'), 'searching',
    payload->>'pickup_zone', payload->>'pickup_label', v_plat, v_plng,
    payload->>'dropoff_zone', payload->>'dropoff_label',
    NULLIF(payload->>'dropoff_lat','')::double precision, NULLIF(payload->>'dropoff_lng','')::double precision,
    payload->>'items_desc', NULLIF(payload->>'distance_km','')::numeric,
    COALESCE(NULLIF(payload->>'fee_fcfa','')::integer, 0),
    COALESCE(NULLIF(payload->>'courier_payout','')::integer, 0),
    COALESCE(NULLIF(payload->>'commission_fcfa','')::integer, 0),
    payload->>'payment_method'
  ) RETURNING id INTO v_id;

  IF v_plat IS NOT NULL AND v_plng IS NOT NULL THEN
    INSERT INTO public.delivery_offers (delivery_id, courier_id, distance_km, status, seq)
    SELECT v_id, n.user_id, n.distance_km, 'queued', (ROW_NUMBER() OVER (ORDER BY n.distance_km)) - 1
    FROM public.nearby_couriers(v_plat, v_plng, 12000, 20) n;
    v_active := public._activate_next_offer(v_id, 45);
  END IF;

  SELECT * INTO v_row FROM public.deliveries WHERE id = v_id;
  RETURN to_jsonb(v_row) || jsonb_build_object(
    'notified_couriers', CASE WHEN v_active IS NULL THEN '[]'::jsonb ELSE jsonb_build_array(v_active) END,
    'active_courier', v_active);
END;
$$;

-- ════════════════════════════════════════════════════════════════════════════
--  accept_delivery(delivery_id, p_user_id) : p_user_id = auth.uid() du coursier.
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.accept_delivery(p_delivery_id uuid, p_courier_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE v_ok boolean := false; v_row deliveries%ROWTYPE;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.delivery_offers
     WHERE delivery_id = p_delivery_id AND courier_id = p_courier_id AND status = 'pending') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_your_turn');
  END IF;

  UPDATE public.deliveries SET courier_id = p_courier_id, status = 'accepted', assigned_at = now()
   WHERE id = p_delivery_id AND courier_id IS NULL AND status IN ('searching','pending')
  RETURNING true INTO v_ok;
  IF v_ok IS NULL OR v_ok = false THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_taken');
  END IF;

  UPDATE public.delivery_offers SET status = 'accepted', responded_at = now()
   WHERE delivery_id = p_delivery_id AND courier_id = p_courier_id;
  UPDATE public.delivery_offers SET status = 'expired', responded_at = now()
   WHERE delivery_id = p_delivery_id AND courier_id <> p_courier_id AND status IN ('pending','queued');

  UPDATE public.couriers SET is_available = false WHERE user_id = p_courier_id;
  UPDATE public.profiles SET courier_status = 'busy' WHERE id = p_courier_id;
  PERFORM public._free_courier_offers(p_courier_id, p_delivery_id);

  SELECT * INTO v_row FROM public.deliveries WHERE id = p_delivery_id;
  RETURN jsonb_build_object('ok', true, 'delivery_id', p_delivery_id,
    'buyer_name', v_row.buyer_name, 'buyer_phone', v_row.buyer_phone,
    'pickup_label', v_row.pickup_label, 'dropoff_label', v_row.dropoff_label,
    'pickup_lat', v_row.pickup_lat, 'pickup_lng', v_row.pickup_lng,
    'dropoff_lat', v_row.dropoff_lat, 'dropoff_lng', v_row.dropoff_lng,
    'items_desc', v_row.items_desc, 'courier_payout', v_row.courier_payout);
END;
$$;

-- ════════════════════════════════════════════════════════════════════════════
--  decline_delivery(delivery_id, p_user_id)
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.decline_delivery(p_delivery_id uuid, p_courier_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE v_next jsonb; v_row deliveries%ROWTYPE;
BEGIN
  SELECT * INTO v_row FROM public.deliveries WHERE id = p_delivery_id;
  IF v_row.status <> 'searching' OR v_row.courier_id IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_searching');
  END IF;

  UPDATE public.delivery_offers SET status = 'declined', responded_at = now()
   WHERE delivery_id = p_delivery_id AND courier_id = p_courier_id AND status = 'pending';

  v_next := public._activate_next_offer(p_delivery_id, 45);
  RETURN jsonb_build_object('ok', true, 'exhausted', (v_next IS NULL), 'next_courier', v_next,
    'notified_couriers', CASE WHEN v_next IS NULL THEN '[]'::jsonb ELSE jsonb_build_array(v_next) END,
    'pickup_label', v_row.pickup_label, 'dropoff_label', v_row.dropoff_label,
    'distance_km', v_row.distance_km, 'courier_payout', v_row.courier_payout, 'fee_fcfa', v_row.fee_fcfa);
END;
$$;

-- ════════════════════════════════════════════════════════════════════════════
--  dispatch_tick(delivery_id) — inchangé fonctionnellement (s'appuie sur _activate)
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.dispatch_tick(p_delivery_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE v_off RECORD; v_next jsonb; v_row deliveries%ROWTYPE;
BEGIN
  SELECT * INTO v_row FROM public.deliveries WHERE id = p_delivery_id;
  IF v_row.status <> 'searching' OR v_row.courier_id IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'state', COALESCE(v_row.status,'unknown'));
  END IF;
  SELECT * INTO v_off FROM public.delivery_offers
   WHERE delivery_id = p_delivery_id AND status = 'pending' ORDER BY seq ASC LIMIT 1;
  IF v_off IS NOT NULL AND v_off.expires_at IS NOT NULL AND v_off.expires_at < now() THEN
    UPDATE public.delivery_offers SET status = 'expired', responded_at = now() WHERE id = v_off.id;
    v_next := public._activate_next_offer(p_delivery_id, 45);
    RETURN jsonb_build_object('ok', true, 'state', 'advanced', 'exhausted', (v_next IS NULL), 'next_courier', v_next,
      'notified_couriers', CASE WHEN v_next IS NULL THEN '[]'::jsonb ELSE jsonb_build_array(v_next) END,
      'pickup_label', v_row.pickup_label, 'dropoff_label', v_row.dropoff_label,
      'distance_km', v_row.distance_km, 'courier_payout', v_row.courier_payout, 'fee_fcfa', v_row.fee_fcfa);
  END IF;
  RETURN jsonb_build_object('ok', true, 'state', 'searching');
END;
$$;

-- ════════════════════════════════════════════════════════════════════════════
--  admin_assign_delivery(delivery_id, p_user_id) : p_user_id = couriers.user_id.
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.admin_assign_delivery(p_delivery_id uuid, p_courier_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE v_row deliveries%ROWTYPE; v_c RECORD;
BEGIN
  UPDATE public.deliveries SET courier_id = p_courier_id, status = 'accepted', assigned_at = now()
   WHERE id = p_delivery_id;

  UPDATE public.delivery_offers SET status = 'expired', responded_at = now()
   WHERE delivery_id = p_delivery_id AND status IN ('pending','queued');
  INSERT INTO public.delivery_offers (delivery_id, courier_id, status, seq, responded_at)
  VALUES (p_delivery_id, p_courier_id, 'accepted', -1, now()) ON CONFLICT DO NOTHING;

  UPDATE public.couriers SET is_available = false WHERE user_id = p_courier_id;
  UPDATE public.profiles SET courier_status = 'busy' WHERE id = p_courier_id;
  PERFORM public._free_courier_offers(p_courier_id, p_delivery_id);

  SELECT * INTO v_row FROM public.deliveries WHERE id = p_delivery_id;
  SELECT user_id, name, phone INTO v_c FROM public.couriers WHERE user_id = p_courier_id;
  RETURN jsonb_build_object('ok', true, 'delivery_id', p_delivery_id,
    'courier', jsonb_build_object('user_id', v_c.user_id, 'name', v_c.name, 'phone', v_c.phone),
    'buyer_name', v_row.buyer_name, 'buyer_phone', v_row.buyer_phone);
END;
$$;

-- ════════════════════════════════════════════════════════════════════════════
--  courier_ping : propage la position sur les courses du coursier (par auth.uid()).
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.courier_ping(p_lat double precision, p_lng double precision)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL OR p_lat IS NULL OR p_lng IS NULL THEN RETURN; END IF;
  UPDATE public.profiles SET current_lat = p_lat, current_lng = p_lng, location_updated_at = now() WHERE id = v_uid;
  UPDATE public.deliveries SET courier_lat = p_lat, courier_lng = p_lng
   WHERE courier_id = v_uid AND status IN ('accepted','picked_up','in_transit');
END;
$$;

-- ════════════════════════════════════════════════════════════════════════════
--  open_deliveries : courses OUVERTES visibles par les livreurs (« voir si
--  intéressé »). SECURITY DEFINER → contourne la RLS pour la consultation.
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.open_deliveries(
  p_lat double precision DEFAULT NULL, p_lng double precision DEFAULT NULL,
  p_radius_m integer DEFAULT 20000, p_limit integer DEFAULT 40)
RETURNS TABLE (
  delivery_id uuid, type text, status text,
  pickup_label text, dropoff_label text,
  pickup_lat double precision, pickup_lng double precision,
  dropoff_lat double precision, dropoff_lng double precision,
  distance_km numeric, fee_fcfa integer, courier_payout integer,
  items_desc text, created_at timestamptz, dist_to_pickup_km numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, extensions
AS $$
  SELECT d.id, d.type, d.status, d.pickup_label, d.dropoff_label,
         d.pickup_lat, d.pickup_lng, d.dropoff_lat, d.dropoff_lng,
         d.distance_km, d.fee_fcfa, d.courier_payout, d.items_desc, d.created_at,
         CASE WHEN p_lat IS NOT NULL AND d.pickup_lat IS NOT NULL
              THEN ROUND((ST_Distance(
                     ST_SetSRID(ST_MakePoint(d.pickup_lng, d.pickup_lat),4326)::geography,
                     ST_SetSRID(ST_MakePoint(p_lng, p_lat),4326)::geography)/1000.0)::numeric,2)
              ELSE NULL END AS dist_to_pickup_km
  FROM public.deliveries d
  WHERE d.status IN ('searching','no_courier') AND d.courier_id IS NULL
    AND (p_lat IS NULL OR d.pickup_lat IS NULL OR ST_DWithin(
          ST_SetSRID(ST_MakePoint(d.pickup_lng, d.pickup_lat),4326)::geography,
          ST_SetSRID(ST_MakePoint(p_lng, p_lat),4326)::geography, GREATEST(p_radius_m,0)))
  ORDER BY dist_to_pickup_km NULLS LAST, d.created_at DESC
  LIMIT GREATEST(p_limit,1);
$$;

-- ════════════════════════════════════════════════════════════════════════════
--  accept_open_delivery : un livreur saisit lui-même une course ouverte (1er arrivé).
--  p_user_id = auth.uid() du coursier. Renvoie les infos mandataire.
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.accept_open_delivery(p_delivery_id uuid, p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE v_ok boolean := false; v_row deliveries%ROWTYPE;
BEGIN
  UPDATE public.deliveries SET courier_id = p_user_id, status = 'accepted', assigned_at = now()
   WHERE id = p_delivery_id AND courier_id IS NULL AND status IN ('searching','no_courier')
  RETURNING true INTO v_ok;
  IF v_ok IS NULL OR v_ok = false THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_taken');
  END IF;

  UPDATE public.delivery_offers SET status = 'expired', responded_at = now()
   WHERE delivery_id = p_delivery_id AND courier_id <> p_user_id AND status IN ('pending','queued');
  UPDATE public.delivery_offers SET status = 'accepted', responded_at = now()
   WHERE delivery_id = p_delivery_id AND courier_id = p_user_id;
  INSERT INTO public.delivery_offers (delivery_id, courier_id, status, seq, responded_at)
  SELECT p_delivery_id, p_user_id, 'accepted', -1, now()
  WHERE NOT EXISTS (SELECT 1 FROM public.delivery_offers WHERE delivery_id = p_delivery_id AND courier_id = p_user_id);

  UPDATE public.couriers SET is_available = false WHERE user_id = p_user_id;
  UPDATE public.profiles SET courier_status = 'busy' WHERE id = p_user_id;
  PERFORM public._free_courier_offers(p_user_id, p_delivery_id);

  SELECT * INTO v_row FROM public.deliveries WHERE id = p_delivery_id;
  RETURN jsonb_build_object('ok', true, 'delivery_id', p_delivery_id,
    'buyer_name', v_row.buyer_name, 'buyer_phone', v_row.buyer_phone,
    'pickup_label', v_row.pickup_label, 'dropoff_label', v_row.dropoff_label,
    'pickup_lat', v_row.pickup_lat, 'pickup_lng', v_row.pickup_lng,
    'dropoff_lat', v_row.dropoff_lat, 'dropoff_lng', v_row.dropoff_lng,
    'items_desc', v_row.items_desc, 'courier_payout', v_row.courier_payout);
END;
$$;

-- ─── Droits ───────────────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public._activate_next_offer(uuid, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._free_courier_offers(uuid, uuid)    FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_delivery(jsonb)                          TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_delivery(uuid, uuid)                     TO authenticated;
GRANT EXECUTE ON FUNCTION public.decline_delivery(uuid, uuid)                    TO authenticated;
GRANT EXECUTE ON FUNCTION public.dispatch_tick(uuid)                             TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.admin_assign_delivery(uuid, uuid)              TO authenticated;
GRANT EXECUTE ON FUNCTION public.courier_ping(double precision, double precision) TO authenticated;
GRANT EXECUTE ON FUNCTION public.open_deliveries(double precision, double precision, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_open_delivery(uuid, uuid)               TO authenticated;
