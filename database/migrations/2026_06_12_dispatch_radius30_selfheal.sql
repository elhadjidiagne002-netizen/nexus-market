-- ════════════════════════════════════════════════════════════════════════════
--  NEXUS Market — DISPATCH : RAYON 30 KM + AUTO-RÉPARATION DES COURSIERS
--
--  DIAGNOSTIC SUR LA BASE DÉPLOYÉE (2026-06-12) : « le problème persiste » —
--  les courses tombaient en no_courier alors que des coursiers étaient en ligne.
--  DEUX causes mesurées :
--
--  1. RAYON TROP ÉTROIT : les courses de test partaient à 21-25 km des
--     coursiers, or le dispatch ne cherchait qu'à 12 km → 0 candidat →
--     no_courier immédiat. Dakar + banlieue (Rufisque, Keur Massar…) s'étend
--     sur ~30 km. → rayon porté à 30 km. La cascade reste « LE PLUS PROCHE
--     D'ABORD » : un coursier lointain n'est sollicité que s'il n'y a personne
--     de plus proche, il voit la distance sur l'offre et peut refuser.
--
--  2. COURSIER « FANTÔME » : un coursier restait is_available=false alors que
--     sa course était LIVRÉE (cas observé : livraison 23:59, toujours bloqué
--     ensuite). complete_delivery remet bien is_available=true, mais certains
--     chemins (fallback front si RPC en échec, annulation, état historique)
--     peuvent laisser l'indicateur bloqué → coursier invisible pour toujours
--     alors que son écran dit « En ligne ». → dispatch_tick_all (cron ~1/min)
--     AUTO-RÉPARE : tout coursier actif, voulu en ligne (courier_status=
--     'available') et SANS course en cours est remis is_available=true.
--
--  S'applique APRÈS 2026_06_11_dispatch_cascade_3min (cascade 3 min conservée,
--  seuls le rayon et le filet changent). admin_assign_delivery INTACT.
--  Idempotent. À exécuter dans Supabase → SQL Editor.
-- ════════════════════════════════════════════════════════════════════════════

SET search_path = public, extensions;

-- ── _activate_next_offer : re-scan élargi à 30 km ─────────────────────────────
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
      -- File épuisée → re-scanner (30 km) les coursiers PAS ENCORE sollicités.
      IF v_d.pickup_lat IS NOT NULL THEN
        INSERT INTO public.delivery_offers (delivery_id, courier_id, distance_km, status, seq)
        SELECT p_delivery_id, n.user_id, n.distance_km, 'queued',
               COALESCE((SELECT MAX(seq) FROM public.delivery_offers WHERE delivery_id = p_delivery_id), -1)
                 + ROW_NUMBER() OVER (ORDER BY n.distance_km)
        FROM public.nearby_couriers(v_d.pickup_lat, v_d.pickup_lng, 30000, 20) n
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

    -- Notification in-app (cloche) au coursier — best-effort.
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

-- ── create_delivery : file d'offres construite sur 30 km ──────────────────────
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
    FROM public.nearby_couriers(v_plat, v_plng, 30000, 20) n;
    v_active := public._activate_next_offer(v_id);
  END IF;

  SELECT * INTO v_row FROM public.deliveries WHERE id = v_id;
  RETURN to_jsonb(v_row) || jsonb_build_object(
    'notified_couriers', CASE WHEN v_active IS NULL THEN '[]'::jsonb ELSE jsonb_build_array(v_active) END,
    'active_courier', v_active);
END;
$$;

-- ── dispatch_tick_all : timeouts + filet + AUTO-RÉPARATION coursiers ──────────
CREATE OR REPLACE FUNCTION public.dispatch_tick_all()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
  r RECORD; v_next jsonb; v_advanced integer := 0; v_healed integer := 0; v_notify jsonb := '[]'::jsonb;
BEGIN
  -- C) AUTO-RÉPARATION : coursier actif, voulu en ligne (courier_status =
  --    'available'), SANS course en cours, mais is_available=false (indicateur
  --    resté bloqué après une livraison/annulation) → on le remet disponible.
  --    Ne touche PAS aux coursiers volontairement hors ligne ni en course.
  UPDATE public.couriers c SET is_available = true
   WHERE c.status = 'active' AND c.is_available = false
     AND EXISTS (SELECT 1 FROM public.profiles p
                  WHERE p.id = c.user_id AND p.courier_status = 'available')
     AND NOT EXISTS (SELECT 1 FROM public.deliveries d
                      WHERE d.courier_id = c.user_id
                        AND d.status IN ('accepted','picked_up','in_transit'));
  GET DIAGNOSTICS v_healed = ROW_COUNT;

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
  --    (no_courier, ou searching à file vide) → ré-amorce la cascade (re-scan
  --    30 km, inclut les coursiers passés en ligne depuis). Courses < 24 h.
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

  RETURN jsonb_build_object('advanced', v_advanced, 'healed', v_healed,
                            'notify', v_notify, 'mode', 'cascade_180s_r30');
END;
$$;

-- ── online_couriers_count : rayon par défaut aligné sur le dispatch (30 km) ──
CREATE OR REPLACE FUNCTION public.online_couriers_count(
  p_lat      double precision DEFAULT NULL,
  p_lng      double precision DEFAULT NULL,
  p_radius_m integer          DEFAULT 30000
)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT count(*)::integer
  FROM public.couriers c
  JOIN public.profiles p ON p.id = c.user_id
  WHERE c.is_available = true
    AND c.status = 'active'
    AND p.geolocation IS NOT NULL
    AND (p.location_updated_at IS NULL OR p.location_updated_at > now() - interval '15 minutes')
    AND (
      p_lat IS NULL OR p_lng IS NULL
      OR ST_DWithin(
           p.geolocation,
           ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography,
           GREATEST(COALESCE(p_radius_m, 30000), 0)
         )
    );
$$;

-- ── Droits (inchangés, réaffirmés) ───────────────────────────────────────────
REVOKE ALL ON FUNCTION public._activate_next_offer(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_delivery(jsonb)  TO authenticated;
GRANT EXECUTE ON FUNCTION public.dispatch_tick_all()     TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.online_couriers_count(double precision, double precision, integer)
  TO anon, authenticated;

-- ════════════════════════════════════════════════════════════════════════════
--  TICK AUTONOME — pg_cron (LA base s'auto-tick, plus de dépendance externe)
--
--  CONSTAT (logs GitHub du 2026-06-11/12) : le schedule GitHub Actions
--  « */5 min » ne tournait en réalité que 1-2×/heure (trous de 3 h 38 mesurés)
--  → offres expirées avancées avec 7 à 260 min de retard → cascade morte dès
--  que les écrans étaient fermés. pg_cron exécute dispatch_tick_all() CHAQUE
--  MINUTE depuis Postgres : timeouts 3 min, filet de sécurité, auto-réparation
--  — sans GitHub, sans cron-job.org, sans écran ouvert.
--
--  Limite : le tick SQL n'envoie pas WhatsApp/Web Push au coursier suivant
--  (notif in-app + poll 12 s de l'app coursier seulement). Le worker HTTP
--  /cron/dispatch?token= (appelé par un cron externe) reste un BONUS pour le
--  push app-fermée — plus une dépendance critique.
-- ════════════════════════════════════════════════════════════════════════════
CREATE EXTENSION IF NOT EXISTS pg_cron;
-- cron.schedule(jobname, …) est un upsert : rejouable sans doublon.
SELECT cron.schedule('nexus-dispatch-tick', '* * * * *', 'select public.dispatch_tick_all();');
