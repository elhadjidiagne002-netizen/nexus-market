-- ════════════════════════════════════════════════════════════════════════════
--  NEXUS Market — DISPATCH : CASCADE AUTOMATIQUE AVEC FENÊTRE DE 3 MINUTES
--
--  DEMANDE (2026-06-11) : l'attribution doit être AUTOMATIQUE et basée sur la
--  distance — le coursier le plus proche reçoit une OFFRE et dispose de
--  **3 minutes** pour l'accepter. S'il refuse ou ne répond pas, l'offre passe
--  au coursier suivant le plus proche, et ainsi de suite. L'admin GARDE toutes
--  ses prérogatives (admin_assign_delivery / « Assigner » / « Auto » ne sont
--  PAS modifiés ici) pour intervenir en cas de nécessité.
--
--  Ce script REMPLACE le mode « attribution directe » introduit par
--  2026_06_10_dispatch_direct_assign.sql (qui assignait sans accord du
--  coursier). Daté 2026_06_11 → s'applique en DERNIER et fait foi.
--
--  Convention (cf. 2026_06_09_dispatch_userid_fix) :
--  deliveries.courier_id = delivery_offers.courier_id = ID UTILISATEUR
--  (auth.uid() = profiles.id = couriers.user_id), JAMAIS couriers.id.
--
--  Mécanique :
--   · create_delivery       → file d'offres triée par distance + active la 1ʳᵉ
--                             offre (180 s) + notification in-app au coursier.
--   · accept_delivery       → inchangé (réaffirmé par userid_fix).
--   · decline_delivery      → refus → active immédiatement le suivant (180 s).
--   · dispatch_tick(id)     → avance UNE course si l'offre active a expiré
--                             (appelé par l'écran d'attente du mandataire).
--   · dispatch_tick_all     → CRON (~1/min, /cron/dispatch?token=) :
--                             a) expire les offres > 3 min → coursier suivant ;
--                             b) FILET DE SÉCURITÉ : ré-amorce les courses
--                                bloquées (searching sans offre active, ou
--                                no_courier) dès qu'un coursier est disponible.
--   · admin_assign_delivery → NON MODIFIÉ : l'admin peut toujours assigner
--                             manuellement n'importe quelle course.
--
--  ⚠️ Pré-requis pour qu'un coursier reçoive une offre (sinon « no_courier ») :
--     couriers.is_available = true ET couriers.status = 'active' (approuvé)
--     ET profiles.geolocation non nul et frais (< 15 min). Voir le DIAGNOSTIC
--     de 2026_06_10_dispatch_consolidate.sql (PARTIE 0).
--
--  Idempotent / rejouable. À exécuter dans Supabase → SQL Editor.
-- ════════════════════════════════════════════════════════════════════════════

SET search_path = public, extensions;

-- Durée de l'offre : 180 s (3 minutes), définie comme DEFAULT du paramètre.
-- Tous les appels internes utilisent le DEFAULT → un seul endroit à changer.

-- ── _activate_next_offer : active l'offre suivante (3 min) + notifie in-app ──
CREATE OR REPLACE FUNCTION public._activate_next_offer(p_delivery_id uuid, p_duree_s integer DEFAULT 180)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
  v_off RECORD; v_c RECORD; v_d RECORD;
  v_guard integer := 0;
BEGIN
  SELECT pickup_lat, pickup_lng, pickup_label, dropoff_label, courier_payout
    INTO v_d FROM public.deliveries WHERE id = p_delivery_id;

  -- Anti-doublon : une offre déjà active ? on la renvoie telle quelle.
  SELECT o.* INTO v_off FROM public.delivery_offers o
   WHERE o.delivery_id = p_delivery_id AND o.status = 'pending' ORDER BY o.seq ASC LIMIT 1;
  IF FOUND THEN
    SELECT c.user_id, c.name, c.phone INTO v_c FROM public.couriers c WHERE c.user_id = v_off.courier_id;
    RETURN jsonb_build_object('courier_id', v_off.courier_id, 'user_id', v_off.courier_id,
                              'name', v_c.name, 'phone', v_c.phone, 'distance_km', v_off.distance_km,
                              'expires_at', v_off.expires_at);
  END IF;

  LOOP
    v_guard := v_guard + 1; IF v_guard > 80 THEN EXIT; END IF;

    SELECT o.* INTO v_off FROM public.delivery_offers o
     WHERE o.delivery_id = p_delivery_id AND o.status = 'queued' ORDER BY o.seq ASC LIMIT 1;

    IF NOT FOUND THEN
      -- File épuisée → re-scanner les coursiers proches PAS ENCORE sollicités
      -- (un coursier peut être passé en ligne depuis la création de la course).
      IF v_d.pickup_lat IS NOT NULL THEN
        INSERT INTO public.delivery_offers (delivery_id, courier_id, distance_km, status, seq)
        SELECT p_delivery_id, n.user_id, n.distance_km, 'queued',
               COALESCE((SELECT MAX(seq) FROM public.delivery_offers WHERE delivery_id = p_delivery_id), -1)
                 + ROW_NUMBER() OVER (ORDER BY n.distance_km)
        FROM public.nearby_couriers(v_d.pickup_lat, v_d.pickup_lng, 12000, 20) n
        WHERE n.user_id NOT IN (SELECT courier_id FROM public.delivery_offers WHERE delivery_id = p_delivery_id);
        SELECT o.* INTO v_off FROM public.delivery_offers o
         WHERE o.delivery_id = p_delivery_id AND o.status = 'queued' ORDER BY o.seq ASC LIMIT 1;
      END IF;
    END IF;

    IF NOT FOUND THEN
      UPDATE public.deliveries SET status = 'no_courier' WHERE id = p_delivery_id AND status = 'searching';
      RETURN NULL;
    END IF;

    -- Coursier encore réellement disponible ? (v_off.courier_id = user_id)
    SELECT c.user_id, c.name, c.phone, c.is_available, c.status
      INTO v_c FROM public.couriers c WHERE c.user_id = v_off.courier_id;
    IF NOT FOUND OR v_c.is_available IS NOT TRUE OR v_c.status <> 'active' THEN
      UPDATE public.delivery_offers SET status = 'expired', responded_at = now() WHERE id = v_off.id;
      CONTINUE;
    END IF;

    -- Activer l'offre : le coursier a p_duree_s secondes (défaut 3 min).
    UPDATE public.delivery_offers
       SET status = 'pending', offered_at = now(),
           expires_at = now() + make_interval(secs => GREATEST(p_duree_s, 10))
     WHERE id = v_off.id;
    UPDATE public.deliveries SET status = 'searching' WHERE id = p_delivery_id AND status = 'no_courier';

    -- Notification in-app (cloche) au coursier — best-effort, ne casse jamais
    -- le dispatch. type 'offer' ∈ contrainte notifications.type.
    BEGIN
      INSERT INTO public.notifications (user_id, type, title, message, link, read)
      VALUES (v_off.courier_id, 'offer',
              '🛵 Nouvelle course — 3 min pour accepter',
              COALESCE(v_d.pickup_label, 'Retrait') || ' → ' || COALESCE(v_d.dropoff_label, 'Livraison')
                || CASE WHEN v_d.courier_payout IS NOT NULL
                        THEN ' · ' || v_d.courier_payout || ' FCFA' ELSE '' END,
              '/', false);
    EXCEPTION WHEN OTHERS THEN NULL;
    END;

    RETURN jsonb_build_object('courier_id', v_off.courier_id, 'user_id', v_off.courier_id,
                              'name', v_c.name, 'phone', v_c.phone, 'distance_km', v_off.distance_km,
                              'expires_at', now() + make_interval(secs => GREATEST(p_duree_s, 10)));
  END LOOP;
  RETURN NULL;
END;
$$;

-- ── _free_courier_offers : libère les offres d'un coursier devenu occupé ─────
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
    IF r.was_active THEN PERFORM public._activate_next_offer(r.delivery_id); END IF;
  END LOOP;
END;
$$;

-- ── create_delivery : file d'offres par distance + 1ʳᵉ offre active (3 min) ──
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
    v_active := public._activate_next_offer(v_id);
  END IF;

  SELECT * INTO v_row FROM public.deliveries WHERE id = v_id;
  RETURN to_jsonb(v_row) || jsonb_build_object(
    'notified_couriers', CASE WHEN v_active IS NULL THEN '[]'::jsonb ELSE jsonb_build_array(v_active) END,
    'active_courier', v_active);
END;
$$;

-- ── decline_delivery : refus → cascade immédiate vers le suivant (3 min) ─────
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

  v_next := public._activate_next_offer(p_delivery_id);
  RETURN jsonb_build_object('ok', true, 'exhausted', (v_next IS NULL), 'next_courier', v_next,
    'notified_couriers', CASE WHEN v_next IS NULL THEN '[]'::jsonb ELSE jsonb_build_array(v_next) END,
    'pickup_label', v_row.pickup_label, 'dropoff_label', v_row.dropoff_label,
    'distance_km', v_row.distance_km, 'courier_payout', v_row.courier_payout, 'fee_fcfa', v_row.fee_fcfa);
END;
$$;

-- ── dispatch_tick : avance UNE course si l'offre active a expiré ─────────────
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
    v_next := public._activate_next_offer(p_delivery_id);
    RETURN jsonb_build_object('ok', true, 'state', 'advanced', 'exhausted', (v_next IS NULL), 'next_courier', v_next,
      'notified_couriers', CASE WHEN v_next IS NULL THEN '[]'::jsonb ELSE jsonb_build_array(v_next) END,
      'pickup_label', v_row.pickup_label, 'dropoff_label', v_row.dropoff_label,
      'distance_km', v_row.distance_km, 'courier_payout', v_row.courier_payout, 'fee_fcfa', v_row.fee_fcfa);
  END IF;
  RETURN jsonb_build_object('ok', true, 'state', 'searching');
END;
$$;

-- ── dispatch_tick_all : CRON — timeouts + filet de sécurité ──────────────────
CREATE OR REPLACE FUNCTION public.dispatch_tick_all()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
  r RECORD; v_next jsonb; v_advanced integer := 0; v_notify jsonb := '[]'::jsonb;
BEGIN
  -- A) Offres actives EXPIRÉES (> 3 min sans réponse) → coursier suivant.
  FOR r IN
    SELECT d.id AS delivery_id, d.pickup_label, d.dropoff_label,
           d.distance_km, d.courier_payout, d.fee_fcfa, o.id AS offer_id
      FROM public.deliveries d
      JOIN public.delivery_offers o ON o.delivery_id = d.id AND o.status = 'pending'
     WHERE d.status = 'searching' AND d.courier_id IS NULL
       AND o.expires_at IS NOT NULL AND o.expires_at < now()
  LOOP
    UPDATE public.delivery_offers SET status = 'expired', responded_at = now() WHERE id = r.offer_id;
    v_next := public._activate_next_offer(r.delivery_id);
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

  -- B) FILET DE SÉCURITÉ : courses sans coursier et SANS offre active
  --    (no_courier, ou searching dont la file s'est vidée alors que l'écran
  --    était fermé). Ré-amorce la cascade — _activate_next_offer re-scanne les
  --    coursiers passés en ligne depuis. Garde-fou : courses < 24 h.
  FOR r IN
    SELECT d.id AS delivery_id, d.pickup_label, d.dropoff_label,
           d.distance_km, d.courier_payout, d.fee_fcfa
      FROM public.deliveries d
     WHERE d.courier_id IS NULL
       AND d.status IN ('searching','no_courier')
       AND d.pickup_lat IS NOT NULL AND d.pickup_lng IS NOT NULL
       AND d.created_at > now() - interval '24 hours'
       AND NOT EXISTS (SELECT 1 FROM public.delivery_offers o
                        WHERE o.delivery_id = d.id AND o.status = 'pending')
     ORDER BY d.created_at ASC
     LIMIT 100
  LOOP
    v_next := public._activate_next_offer(r.delivery_id);
    IF v_next IS NOT NULL THEN
      v_advanced := v_advanced + 1;
      v_notify := v_notify || jsonb_build_array(jsonb_build_object(
        'delivery_id', r.delivery_id, 'courier_id', v_next->>'courier_id', 'user_id', v_next->>'user_id',
        'name', v_next->>'name', 'phone', v_next->>'phone',
        'distance_km', (v_next->>'distance_km')::numeric,
        'pickup_label', r.pickup_label, 'dropoff_label', r.dropoff_label,
        'course_km', r.distance_km, 'courier_payout', r.courier_payout, 'fee_fcfa', r.fee_fcfa));
    END IF;
  END LOOP;

  RETURN jsonb_build_object('advanced', v_advanced, 'notify', v_notify, 'mode', 'cascade_180s');
END;
$$;

-- ── Droits (parité avec userid_fix/consolidate) ───────────────────────────────
REVOKE ALL ON FUNCTION public._activate_next_offer(uuid, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._free_courier_offers(uuid, uuid)    FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_delivery(jsonb)           TO authenticated;
GRANT EXECUTE ON FUNCTION public.decline_delivery(uuid, uuid)     TO authenticated;
GRANT EXECUTE ON FUNCTION public.dispatch_tick(uuid)              TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.dispatch_tick_all()              TO authenticated, anon, service_role;

-- ════════════════════════════════════════════════════════════════════════════
--  RÉPARATION (optionnel, une fois) : ré-amorce les courses en attente pour
--  qu'elles repartent en cascade 3 min. Sans risque (ne touche qu'aux courses
--  non attribuées). Dé-commenter pour exécuter.
-- ════════════════════════════════════════════════════════════════════════════
-- DO $$
-- DECLARE x uuid;
-- BEGIN
--   FOR x IN SELECT id FROM public.deliveries
--            WHERE courier_id IS NULL AND status IN ('searching','no_courier')
--              AND pickup_lat IS NOT NULL
--   LOOP PERFORM public._activate_next_offer(x); END LOOP;
-- END $$;
