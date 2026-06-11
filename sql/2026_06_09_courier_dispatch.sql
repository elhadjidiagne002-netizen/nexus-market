-- ════════════════════════════════════════════════════════════════════════════
--  NEXUS Market — Dispatch coursier EN CASCADE (façon Yango)
--  · Attribution automatique au coursier le PLUS PROCHE.
--  · En cas de REFUS (ou expiration), passe au coursier suivant le plus proche,
--    et ainsi de suite à l'infini (re-scan si la file est épuisée).
--  · Le coursier qui ACCEPTE reçoit les infos du MANDATAIRE (nom + téléphone).
--  · Attribution MANUELLE possible par l'admin (admin_assign_delivery).
--
--  Idempotent / rejouable. Prérequis : 2026_06_09_courier_geo_postgis.sql
--  (PostGIS + profiles.geolocation + nearby_couriers). À exécuter APRÈS.
-- ════════════════════════════════════════════════════════════════════════════

SET search_path = public, extensions;

-- ─── Colonnes : coordonnées du mandataire + ordre de la file d'offres ────────
ALTER TABLE public.deliveries     ADD COLUMN IF NOT EXISTS buyer_phone text;
ALTER TABLE public.deliveries     ADD COLUMN IF NOT EXISTS buyer_name  text;
ALTER TABLE public.delivery_offers ADD COLUMN IF NOT EXISTS seq integer;

CREATE INDEX IF NOT EXISTS idx_delivery_offers_dlv_seq ON public.delivery_offers(delivery_id, seq);

-- Nettoyage des versions antérieures (signatures recréées plus bas)
DROP FUNCTION IF EXISTS public.create_delivery(jsonb);
DROP FUNCTION IF EXISTS public.accept_delivery(uuid, uuid);

-- ════════════════════════════════════════════════════════════════════════════
--  Helper interne : active le PROCHAIN coursier de la file (offre 'pending').
--  Renvoie le coursier activé (jsonb) ou NULL si file épuisée.
--  duree_s = délai avant expiration de l'offre.
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public._activate_next_offer(p_delivery_id uuid, p_duree_s integer DEFAULT 45)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_off RECORD;
  v_c   RECORD;
  v_plat double precision; v_plng double precision;
BEGIN
  -- 1) Prochaine offre en file d'attente (plus proche en premier)
  SELECT * INTO v_off FROM public.delivery_offers
   WHERE delivery_id = p_delivery_id AND status = 'queued'
   ORDER BY seq ASC LIMIT 1;

  -- 2) File épuisée → re-scan des coursiers en ligne non encore sollicités
  IF v_off IS NULL THEN
    SELECT pickup_lat, pickup_lng INTO v_plat, v_plng FROM public.deliveries WHERE id = p_delivery_id;
    IF v_plat IS NOT NULL THEN
      INSERT INTO public.delivery_offers (delivery_id, courier_id, distance_km, status, seq)
      SELECT p_delivery_id, n.courier_id, n.distance_km, 'queued',
             COALESCE((SELECT MAX(seq) FROM public.delivery_offers WHERE delivery_id = p_delivery_id), -1)
               + ROW_NUMBER() OVER (ORDER BY n.distance_km)
      FROM public.nearby_couriers(v_plat, v_plng, 12000, 20) n
      WHERE n.courier_id NOT IN (SELECT courier_id FROM public.delivery_offers WHERE delivery_id = p_delivery_id);
      SELECT * INTO v_off FROM public.delivery_offers
       WHERE delivery_id = p_delivery_id AND status = 'queued'
       ORDER BY seq ASC LIMIT 1;
    END IF;
  END IF;

  -- 3) Toujours personne → on s'arrête
  IF v_off IS NULL THEN
    UPDATE public.deliveries SET status = 'no_courier' WHERE id = p_delivery_id AND status = 'searching';
    RETURN NULL;
  END IF;

  -- 4) Active l'offre (pending + expiration)
  UPDATE public.delivery_offers
     SET status = 'pending', offered_at = now(), expires_at = now() + make_interval(secs => GREATEST(p_duree_s, 10))
   WHERE id = v_off.id;

  SELECT c.id, c.user_id, c.name, c.phone INTO v_c FROM public.couriers c WHERE c.id = v_off.courier_id;
  RETURN jsonb_build_object(
    'courier_id', v_c.id, 'user_id', v_c.user_id, 'name', v_c.name,
    'phone', v_c.phone, 'distance_km', v_off.distance_km
  );
END;
$$;

-- ════════════════════════════════════════════════════════════════════════════
--  create_delivery : insère la course + construit la FILE (plus proche → loin)
--  et active SEULEMENT le coursier le plus proche.
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.create_delivery(payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_id uuid;
  v_plat double precision := NULLIF(payload->>'pickup_lat','')::double precision;
  v_plng double precision := NULLIF(payload->>'pickup_lng','')::double precision;
  v_active jsonb := NULL;
  v_row deliveries%ROWTYPE;
BEGIN
  INSERT INTO public.deliveries (
    buyer_id, buyer_name, buyer_phone, order_id, type, status,
    pickup_zone, pickup_label, pickup_lat, pickup_lng,
    dropoff_zone, dropoff_label, dropoff_lat, dropoff_lng,
    items_desc, distance_km, fee_fcfa, courier_payout, commission_fcfa, payment_method
  ) VALUES (
    NULLIF(payload->>'buyer_id','')::uuid,
    payload->>'buyer_name',
    payload->>'buyer_phone',
    NULLIF(payload->>'order_id','')::uuid,
    COALESCE(NULLIF(payload->>'type',''), 'errand'),
    'searching',
    payload->>'pickup_zone', payload->>'pickup_label', v_plat, v_plng,
    payload->>'dropoff_zone', payload->>'dropoff_label',
    NULLIF(payload->>'dropoff_lat','')::double precision,
    NULLIF(payload->>'dropoff_lng','')::double precision,
    payload->>'items_desc',
    NULLIF(payload->>'distance_km','')::numeric,
    COALESCE(NULLIF(payload->>'fee_fcfa','')::integer, 0),
    COALESCE(NULLIF(payload->>'courier_payout','')::integer, 0),
    COALESCE(NULLIF(payload->>'commission_fcfa','')::integer, 0),
    payload->>'payment_method'
  ) RETURNING id INTO v_id;

  -- File ordonnée par distance (tous 'queued'), puis on active le plus proche.
  IF v_plat IS NOT NULL AND v_plng IS NOT NULL THEN
    INSERT INTO public.delivery_offers (delivery_id, courier_id, distance_km, status, seq)
    SELECT v_id, n.courier_id, n.distance_km, 'queued',
           (ROW_NUMBER() OVER (ORDER BY n.distance_km)) - 1
    FROM public.nearby_couriers(v_plat, v_plng, 12000, 20) n;

    v_active := public._activate_next_offer(v_id, 45);
  END IF;

  SELECT * INTO v_row FROM public.deliveries WHERE id = v_id;

  RETURN to_jsonb(v_row) || jsonb_build_object(
    'notified_couriers', CASE WHEN v_active IS NULL THEN '[]'::jsonb ELSE jsonb_build_array(v_active) END,
    'active_courier', v_active
  );
END;
$$;

-- ════════════════════════════════════════════════════════════════════════════
--  accept_delivery : le coursier ACTIF accepte. Renvoie les infos MANDATAIRE.
--  (échoue si l'offre n'est pas 'pending' pour ce coursier → respect de l'ordre)
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.accept_delivery(p_delivery_id uuid, p_courier_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_ok boolean := false;
  v_user uuid;
  v_row deliveries%ROWTYPE;
BEGIN
  -- L'offre de CE coursier doit être active (pending) et la course libre.
  IF NOT EXISTS (
    SELECT 1 FROM public.delivery_offers
     WHERE delivery_id = p_delivery_id AND courier_id = p_courier_id AND status = 'pending'
  ) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_your_turn');
  END IF;

  UPDATE public.deliveries
     SET courier_id = p_courier_id, status = 'accepted', assigned_at = now()
   WHERE id = p_delivery_id AND courier_id IS NULL AND status IN ('searching','pending')
  RETURNING true INTO v_ok;

  IF v_ok IS NULL OR v_ok = false THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_taken');
  END IF;

  UPDATE public.delivery_offers SET status = 'accepted', responded_at = now()
   WHERE delivery_id = p_delivery_id AND courier_id = p_courier_id;
  UPDATE public.delivery_offers SET status = 'expired', responded_at = now()
   WHERE delivery_id = p_delivery_id AND courier_id <> p_courier_id AND status IN ('pending','queued');

  UPDATE public.couriers SET is_available = false WHERE id = p_courier_id;
  SELECT user_id INTO v_user FROM public.couriers WHERE id = p_courier_id;
  IF v_user IS NOT NULL THEN UPDATE public.profiles SET courier_status = 'busy' WHERE id = v_user; END IF;

  SELECT * INTO v_row FROM public.deliveries WHERE id = p_delivery_id;
  RETURN jsonb_build_object(
    'ok', true, 'delivery_id', p_delivery_id,
    'buyer_name', v_row.buyer_name, 'buyer_phone', v_row.buyer_phone,
    'pickup_label', v_row.pickup_label, 'dropoff_label', v_row.dropoff_label,
    'pickup_lat', v_row.pickup_lat, 'pickup_lng', v_row.pickup_lng,
    'dropoff_lat', v_row.dropoff_lat, 'dropoff_lng', v_row.dropoff_lng,
    'items_desc', v_row.items_desc, 'courier_payout', v_row.courier_payout
  );
END;
$$;

-- ════════════════════════════════════════════════════════════════════════════
--  decline_delivery : REFUS du coursier actif → on active le suivant (cascade).
--  Renvoie le prochain coursier (pour notification) ou exhausted=true.
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.decline_delivery(p_delivery_id uuid, p_courier_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_next jsonb;
  v_row deliveries%ROWTYPE;
BEGIN
  SELECT * INTO v_row FROM public.deliveries WHERE id = p_delivery_id;
  IF v_row.status <> 'searching' OR v_row.courier_id IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_searching');
  END IF;

  UPDATE public.delivery_offers SET status = 'declined', responded_at = now()
   WHERE delivery_id = p_delivery_id AND courier_id = p_courier_id AND status = 'pending';

  v_next := public._activate_next_offer(p_delivery_id, 45);

  RETURN jsonb_build_object(
    'ok', true,
    'exhausted', (v_next IS NULL),
    'next_courier', v_next,
    'notified_couriers', CASE WHEN v_next IS NULL THEN '[]'::jsonb ELSE jsonb_build_array(v_next) END,
    'pickup_label', v_row.pickup_label, 'dropoff_label', v_row.dropoff_label,
    'distance_km', v_row.distance_km, 'courier_payout', v_row.courier_payout, 'fee_fcfa', v_row.fee_fcfa
  );
END;
$$;

-- ════════════════════════════════════════════════════════════════════════════
--  dispatch_tick : avance la cascade si l'offre active a EXPIRÉ (timeout).
--  À appeler périodiquement par le mandataire qui attend (et/ou un cron).
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.dispatch_tick(p_delivery_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_off RECORD;
  v_next jsonb;
  v_row deliveries%ROWTYPE;
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
    RETURN jsonb_build_object('ok', true, 'state', 'advanced', 'exhausted', (v_next IS NULL),
                              'next_courier', v_next,
                              'notified_couriers', CASE WHEN v_next IS NULL THEN '[]'::jsonb ELSE jsonb_build_array(v_next) END,
                              'pickup_label', v_row.pickup_label, 'dropoff_label', v_row.dropoff_label,
                              'distance_km', v_row.distance_km, 'courier_payout', v_row.courier_payout, 'fee_fcfa', v_row.fee_fcfa);
  END IF;

  RETURN jsonb_build_object('ok', true, 'state', 'searching');
END;
$$;

-- ════════════════════════════════════════════════════════════════════════════
--  admin_assign_delivery : attribution MANUELLE par l'admin (force).
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.admin_assign_delivery(p_delivery_id uuid, p_courier_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_user uuid;
  v_row deliveries%ROWTYPE;
  v_c RECORD;
BEGIN
  UPDATE public.deliveries
     SET courier_id = p_courier_id, status = 'accepted', assigned_at = now()
   WHERE id = p_delivery_id;

  UPDATE public.delivery_offers SET status = 'expired', responded_at = now()
   WHERE delivery_id = p_delivery_id AND status IN ('pending','queued');
  INSERT INTO public.delivery_offers (delivery_id, courier_id, status, seq, responded_at)
  VALUES (p_delivery_id, p_courier_id, 'accepted', -1, now())
  ON CONFLICT DO NOTHING;

  UPDATE public.couriers SET is_available = false WHERE id = p_courier_id;
  SELECT user_id INTO v_user FROM public.couriers WHERE id = p_courier_id;
  IF v_user IS NOT NULL THEN UPDATE public.profiles SET courier_status = 'busy' WHERE id = v_user; END IF;

  SELECT * INTO v_row FROM public.deliveries WHERE id = p_delivery_id;
  SELECT id, user_id, name, phone INTO v_c FROM public.couriers WHERE id = p_courier_id;
  RETURN jsonb_build_object('ok', true, 'delivery_id', p_delivery_id,
    'courier', jsonb_build_object('courier_id', v_c.id, 'user_id', v_c.user_id, 'name', v_c.name, 'phone', v_c.phone),
    'buyer_name', v_row.buyer_name, 'buyer_phone', v_row.buyer_phone);
END;
$$;

-- ─── Droits d'exécution ───────────────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION public.create_delivery(jsonb)                       TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_delivery(uuid, uuid)                  TO authenticated;
GRANT EXECUTE ON FUNCTION public.decline_delivery(uuid, uuid)                 TO authenticated;
GRANT EXECUTE ON FUNCTION public.dispatch_tick(uuid)                          TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.admin_assign_delivery(uuid, uuid)            TO authenticated;
-- _activate_next_offer reste interne (SECURITY DEFINER, non exposé directement).
REVOKE ALL ON FUNCTION public._activate_next_offer(uuid, integer) FROM PUBLIC;
