-- ════════════════════════════════════════════════════════════════════════════
--  NEXUS Market — CONSOLIDATION DISPATCH COURSIER (attribution automatique)
--
--  SYMPTÔME : « attribution automatique des courses pas fonctionnel » — une
--  course créée reste en 'searching'/'no_courier', aucun coursier ne reçoit ni
--  ne peut accepter l'offre.
--
--  CAUSE RACINE (cf. CLAUDE.md §4 : migrations divergentes) : les fonctions
--  d'offre existent en DEUX conventions incompatibles selon l'ordre d'exécution :
--    · courier_dispatch.sql / dispatch_fixes.sql  → delivery_offers.courier_id = couriers.id
--    · dispatch_userid_fix.sql (CORRECT)          → delivery_offers.courier_id = USER id
--  Or accept_delivery, decline_delivery, getCourierOffers (front), ET les
--  policies RLS comparent toutes `courier_id = auth.uid()` (= profiles.id =
--  couriers.user_id). Si la version « couriers.id » est la dernière déployée,
--  les offres sont créées avec un id que PERSONNE ne peut matcher → dispatch mort.
--
--  CE SCRIPT réaffirme la convention USER_ID pour la CRÉATION d'offres
--  (_activate_next_offer, create_delivery, _free_courier_offers) + dispatch_tick_all.
--  Daté 2026_06_10 → s'applique APRÈS toutes les migrations dispatch précédentes
--  et fait foi. Idempotent / rejouable.
--
--  À exécuter dans Supabase → SQL Editor (rôle postgres). Exécuter d'abord la
--  PARTIE 0 (diagnostic, lecture seule) pour confirmer la cause.
-- ════════════════════════════════════════════════════════════════════════════

SET search_path = public, extensions;

-- ════════════════════════════════════════════════════════════════════════════
--  PARTIE 0 — DIAGNOSTIC (LECTURE SEULE) — exécuter et lire les résultats
-- ════════════════════════════════════════════════════════════════════════════

-- 0.1 Convention réellement utilisée par les offres existantes :
--     si keyed_by_user >> keyed_by_courier → déjà OK ; l'inverse → CAUSE CONFIRMÉE.
-- SELECT
--   count(*) FILTER (WHERE o.courier_id IN (SELECT user_id FROM public.couriers)) AS keyed_by_user,
--   count(*) FILTER (WHERE o.courier_id IN (SELECT id      FROM public.couriers)) AS keyed_by_courier_id,
--   count(*) AS total_offers
-- FROM public.delivery_offers o;

-- 0.2 Coursiers ÉLIGIBLES au matching (doivent être > 0 pour une attribution auto) :
-- SELECT count(*) AS eligibles
-- FROM public.couriers c
-- JOIN public.profiles p ON p.id = c.user_id
-- WHERE c.is_available = true
--   AND c.status = 'active'
--   AND p.geolocation IS NOT NULL
--   AND (p.location_updated_at IS NULL OR p.location_updated_at > now() - interval '15 minutes');

-- 0.3 Détail des coursiers (pour voir QUEL critère bloque) :
-- SELECT c.name, c.is_available, c.status,
--        (p.geolocation IS NOT NULL) AS has_geo,
--        p.location_updated_at,
--        (p.location_updated_at > now() - interval '15 minutes') AS geo_fresh
-- FROM public.couriers c JOIN public.profiles p ON p.id = c.user_id
-- ORDER BY c.status, c.is_available;

-- 0.4 Courses bloquées en attente d'attribution :
-- SELECT id, status, courier_id, pickup_lat, pickup_lng, created_at
-- FROM public.deliveries
-- WHERE status IN ('searching','no_courier') AND courier_id IS NULL
-- ORDER BY created_at DESC LIMIT 20;


-- ════════════════════════════════════════════════════════════════════════════
--  PARTIE 1 — CORRECTIF : offres keyées sur l'ID UTILISATEUR (convention CORRECTE)
-- ════════════════════════════════════════════════════════════════════════════

-- ── _activate_next_offer : file basée sur l'ID UTILISATEUR du coursier. ───────
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

-- ── _free_courier_offers : keyé sur l'ID UTILISATEUR. ─────────────────────────
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

-- ── create_delivery : offres keyées sur l'ID UTILISATEUR. ─────────────────────
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

-- ── dispatch_tick_all : avance toutes les cascades expirées (cron). ───────────
--    Convention-agnostique (délègue à _activate_next_offer) — inclus ici pour
--    faire foi comme dernière définition déployée.
CREATE OR REPLACE FUNCTION public.dispatch_tick_all()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
  r RECORD; v_next jsonb; v_advanced integer := 0; v_notify jsonb := '[]'::jsonb;
BEGIN
  FOR r IN
    SELECT d.id AS delivery_id, d.pickup_label, d.dropoff_label,
           d.distance_km, d.courier_payout, d.fee_fcfa, o.id AS offer_id
      FROM public.deliveries d
      JOIN public.delivery_offers o ON o.delivery_id = d.id AND o.status = 'pending'
     WHERE d.status = 'searching' AND d.courier_id IS NULL
       AND o.expires_at IS NOT NULL AND o.expires_at < now()
  LOOP
    UPDATE public.delivery_offers SET status = 'expired', responded_at = now() WHERE id = r.offer_id;
    v_next := public._activate_next_offer(r.delivery_id, 45);
    v_advanced := v_advanced + 1;
    IF v_next IS NOT NULL THEN
      v_notify := v_notify || jsonb_build_array(jsonb_build_object(
        'delivery_id', r.delivery_id, 'courier_id', v_next->>'courier_id', 'user_id', v_next->>'user_id',
        'name', v_next->>'name', 'phone', v_next->>'phone',
        'distance_km', (v_next->>'distance_km')::numeric,
        'pickup_label', r.pickup_label, 'dropoff_label', r.dropoff_label,
        'course_km', r.distance_km, 'courier_payout', r.courier_payout, 'fee_fcfa', r.fee_fcfa));
    END IF;
  END LOOP;
  RETURN jsonb_build_object('advanced', v_advanced, 'notify', v_notify);
END;
$$;

-- ── Droits ────────────────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public._activate_next_offer(uuid, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._free_courier_offers(uuid, uuid)    FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_delivery(jsonb)   TO authenticated;
GRANT EXECUTE ON FUNCTION public.dispatch_tick_all()      TO authenticated, anon, service_role;

-- ════════════════════════════════════════════════════════════════════════════
--  PARTIE 2 — RÉPARATION DES DONNÉES (optionnel, à exécuter une fois après le
--  correctif) : ré-amorce les courses bloquées pour qu'elles repartent en
--  cascade avec la bonne convention. Sans risque (ne touche qu'aux courses non
--  attribuées). Dé-commenter pour exécuter.
-- ════════════════════════════════════════════════════════════════════════════
-- UPDATE public.delivery_offers o SET status = 'expired', responded_at = now()
--  FROM public.deliveries d
--  WHERE o.delivery_id = d.id AND d.courier_id IS NULL
--    AND d.status IN ('searching','no_courier') AND o.status IN ('pending','queued');
-- DO $$
-- DECLARE x uuid;
-- BEGIN
--   FOR x IN SELECT id FROM public.deliveries
--            WHERE courier_id IS NULL AND status IN ('searching','no_courier')
--   LOOP PERFORM public._activate_next_offer(x, 45); END LOOP;
-- END $$;
