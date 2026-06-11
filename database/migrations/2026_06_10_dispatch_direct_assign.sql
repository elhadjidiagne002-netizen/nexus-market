-- ════════════════════════════════════════════════════════════════════════════
--  NEXUS Market — DISPATCH : ATTRIBUTION DIRECTE AU PLUS PROCHE (sans admin)
--
--  DEMANDE : l'admin ne doit PLUS avoir à appuyer sur « Assigner ». Dès qu'une
--  course est créée, elle est AUTOMATIQUEMENT attribuée au coursier disponible
--  le plus proche (pas d'étape « le 1er qui accepte »). L'admin n'intervient
--  que si AUCUN coursier n'est disponible.
--
--  Ce script (daté pour s'appliquer APRÈS 2026_06_10_dispatch_consolidate) :
--   · _auto_assign_nearest(delivery) : verrouille et assigne le coursier le plus
--     proche réellement disponible (anti double-assignation concurrente).
--   · create_delivery : assigne directement à la création (au lieu d'offrir).
--   · dispatch_tick_all : FILET DE SÉCURITÉ — le cron ré-attribue toute course
--     restée sans coursier (créée alors que personne n'était en ligne) dès qu'un
--     coursier devient disponible.
--
--  Convention : courier_id = user_id (auth.uid) — cf. dispatch_userid_fix.
--  Idempotent. À exécuter dans Supabase → SQL Editor.
--
--  ⚠️ Pré-requis pour qu'un coursier soit éligible (sinon « no_courier ») :
--     couriers.is_available=true ET couriers.status='active' (approuvé) ET
--     profiles.geolocation non nul ET frais (<15 min). Voir le DIAGNOSTIC de
--     2026_06_10_dispatch_consolidate.sql (PARTIE 0) si rien ne s'assigne.
-- ════════════════════════════════════════════════════════════════════════════

SET search_path = public, extensions;

-- ── _auto_assign_nearest : assigne directement le coursier dispo le + proche ──
CREATE OR REPLACE FUNCTION public._auto_assign_nearest(p_delivery_id uuid, p_radius_m integer DEFAULT 12000)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
  v_plat double precision; v_plng double precision;
  v_cand RECORD; v_locked uuid; v_ok boolean := false;
BEGIN
  SELECT pickup_lat, pickup_lng INTO v_plat, v_plng FROM public.deliveries
   WHERE id = p_delivery_id AND courier_id IS NULL AND status IN ('searching','no_courier');
  IF NOT FOUND THEN RETURN NULL; END IF;            -- déjà assignée / inexistante
  IF v_plat IS NULL OR v_plng IS NULL THEN
    UPDATE public.deliveries SET status = 'no_courier' WHERE id = p_delivery_id AND status = 'searching';
    RETURN NULL;
  END IF;

  -- Du + proche au + loin : verrouille le 1er coursier réellement disponible et
  -- l'assigne. FOR UPDATE SKIP LOCKED évite que 2 courses prennent le même.
  FOR v_cand IN
    SELECT n.user_id, n.name, n.phone, n.distance_km
      FROM public.nearby_couriers(v_plat, v_plng, p_radius_m, 10) n
  LOOP
    SELECT c.user_id INTO v_locked FROM public.couriers c
     WHERE c.user_id = v_cand.user_id AND c.is_available = true AND c.status = 'active'
     FOR UPDATE SKIP LOCKED;
    IF v_locked IS NULL THEN CONTINUE; END IF;       -- pris/verrouillé entre-temps

    UPDATE public.deliveries
       SET courier_id = v_cand.user_id, status = 'accepted', assigned_at = now()
     WHERE id = p_delivery_id AND courier_id IS NULL
    RETURNING true INTO v_ok;
    IF v_ok IS NOT TRUE THEN RETURN NULL; END IF;    -- course prise entre-temps

    UPDATE public.couriers SET is_available = false WHERE user_id = v_cand.user_id;
    UPDATE public.profiles SET courier_status = 'busy' WHERE id = v_cand.user_id;

    -- Trace (offre 'accepted') + neutralise d'éventuelles offres en file.
    UPDATE public.delivery_offers SET status = 'expired', responded_at = now()
     WHERE delivery_id = p_delivery_id AND status IN ('pending','queued');
    INSERT INTO public.delivery_offers (delivery_id, courier_id, distance_km, status, seq, responded_at)
    VALUES (p_delivery_id, v_cand.user_id, v_cand.distance_km, 'accepted', -1, now())
    ON CONFLICT DO NOTHING;
    PERFORM public._free_courier_offers(v_cand.user_id, p_delivery_id);

    RETURN jsonb_build_object('courier_id', v_cand.user_id, 'user_id', v_cand.user_id,
      'name', v_cand.name, 'phone', v_cand.phone, 'distance_km', v_cand.distance_km, 'assigned', true);
  END LOOP;

  -- Personne de disponible → en attente (le cron ré-essaiera, ou l'admin assigne).
  UPDATE public.deliveries SET status = 'no_courier' WHERE id = p_delivery_id AND status = 'searching';
  RETURN NULL;
END;
$$;

-- ── create_delivery : attribution DIRECTE à la création ───────────────────────
CREATE OR REPLACE FUNCTION public.create_delivery(payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
  v_id uuid;
  v_plat double precision := NULLIF(payload->>'pickup_lat','')::double precision;
  v_plng double precision := NULLIF(payload->>'pickup_lng','')::double precision;
  v_assigned jsonb := NULL; v_row deliveries%ROWTYPE;
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

  -- Attribution AUTOMATIQUE immédiate au plus proche (si position de retrait).
  IF v_plat IS NOT NULL AND v_plng IS NOT NULL THEN
    v_assigned := public._auto_assign_nearest(v_id, 12000);
  END IF;

  SELECT * INTO v_row FROM public.deliveries WHERE id = v_id;
  RETURN to_jsonb(v_row) || jsonb_build_object(
    'assigned_courier',  v_assigned,
    'active_courier',    v_assigned,
    -- compat front (NexusWA / push) : le coursier assigné à notifier
    'notified_couriers', CASE WHEN v_assigned IS NULL THEN '[]'::jsonb ELSE jsonb_build_array(v_assigned) END);
END;
$$;

-- ── dispatch_tick_all : FILET DE SÉCURITÉ — ré-attribue les courses en attente ─
--    Appelée par le cron /cron/dispatch (~1/min). Toute course sans coursier
--    (créée alors que personne n'était en ligne) est attribuée dès qu'un
--    coursier devient disponible. Renvoie la liste à notifier (WhatsApp/push).
CREATE OR REPLACE FUNCTION public.dispatch_tick_all()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
  r RECORD; v_assigned jsonb; v_advanced integer := 0; v_notify jsonb := '[]'::jsonb;
BEGIN
  FOR r IN
    SELECT d.id AS delivery_id, d.pickup_label, d.dropoff_label,
           d.distance_km, d.courier_payout, d.fee_fcfa
      FROM public.deliveries d
     WHERE d.courier_id IS NULL
       AND d.status IN ('searching','no_courier')
       AND d.pickup_lat IS NOT NULL AND d.pickup_lng IS NOT NULL
     ORDER BY d.created_at ASC
     LIMIT 100
  LOOP
    v_assigned := public._auto_assign_nearest(r.delivery_id, 12000);
    IF v_assigned IS NOT NULL THEN
      v_advanced := v_advanced + 1;
      v_notify := v_notify || jsonb_build_array(jsonb_build_object(
        'delivery_id',   r.delivery_id,
        'courier_id',    v_assigned->>'courier_id', 'user_id', v_assigned->>'user_id',
        'name',          v_assigned->>'name', 'phone', v_assigned->>'phone',
        'distance_km',   (v_assigned->>'distance_km')::numeric,
        'pickup_label',  r.pickup_label, 'dropoff_label', r.dropoff_label,
        'course_km',     r.distance_km, 'courier_payout', r.courier_payout,
        'fee_fcfa',      r.fee_fcfa, 'assigned', true));
    END IF;
  END LOOP;
  RETURN jsonb_build_object('advanced', v_advanced, 'notify', v_notify, 'mode', 'direct_assign');
END;
$$;

-- ── Droits ────────────────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public._auto_assign_nearest(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_delivery(jsonb)   TO authenticated;
GRANT EXECUTE ON FUNCTION public.dispatch_tick_all()      TO authenticated, anon, service_role;

-- ── Réparation immédiate (optionnel) : attribue maintenant les courses déjà en
--    attente. Sans risque (ne touche qu'aux courses non attribuées avec GPS).
-- DO $$
-- DECLARE x uuid;
-- BEGIN
--   FOR x IN SELECT id FROM public.deliveries
--            WHERE courier_id IS NULL AND status IN ('searching','no_courier')
--              AND pickup_lat IS NOT NULL
--   LOOP PERFORM public._auto_assign_nearest(x, 12000); END LOOP;
-- END $$;
