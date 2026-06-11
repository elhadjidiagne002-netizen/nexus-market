-- ════════════════════════════════════════════════════════════════════════════
--  NEXUS Market — CORRECTIFS du dispatch coursier (fiabilité de l'attribution)
--
--  Corrige 3 problèmes du dispatch en cascade :
--   (1) On activait parfois un coursier devenu INDISPONIBLE (occupé/hors ligne)
--       → l'offre brûlait 45 s pour rien. Désormais on SAUTE ces coursiers.
--   (2) Un coursier qui ACCEPTE (ou est assigné) gardait des offres 'pending'/
--       'queued' sur D'AUTRES courses, BLOQUANT leur cascade jusqu'au timeout.
--       → on libère ses autres offres et on relance ces cascades immédiatement.
--   (3) Une course passée 'no_courier' n'était JAMAIS relancée quand un nouveau
--       coursier se connectait → le cron la ré-essaie (re-scan) à l'infini.
--   + garde-fou anti double-offre 'pending' simultanée.
--
--  Idempotent. Prérequis : 2026_06_09_courier_dispatch.sql + _tick_all.
--  À exécuter dans Supabase → SQL Editor (APRÈS les deux précédentes).
-- ════════════════════════════════════════════════════════════════════════════

SET search_path = public, extensions;

-- ════════════════════════════════════════════════════════════════════════════
--  _activate_next_offer (v2) : saute les coursiers indisponibles, anti-doublon,
--  ressuscite une course 'no_courier' si un coursier redevient disponible.
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
  v_guard integer := 0;
BEGIN
  -- Garde-fou : si une offre est DÉJÀ active, ne pas en créer une 2e.
  SELECT o.* INTO v_off FROM public.delivery_offers o
   WHERE o.delivery_id = p_delivery_id AND o.status = 'pending'
   ORDER BY o.seq ASC LIMIT 1;
  IF FOUND THEN
    SELECT c.id, c.user_id, c.name, c.phone INTO v_c FROM public.couriers c WHERE c.id = v_off.courier_id;
    RETURN jsonb_build_object('courier_id', v_c.id, 'user_id', v_c.user_id, 'name', v_c.name,
                              'phone', v_c.phone, 'distance_km', v_off.distance_km);
  END IF;

  LOOP
    v_guard := v_guard + 1;
    IF v_guard > 80 THEN EXIT; END IF;            -- sécurité anti-boucle

    -- 1) Prochaine offre en file (plus proche d'abord)
    SELECT o.* INTO v_off FROM public.delivery_offers o
     WHERE o.delivery_id = p_delivery_id AND o.status = 'queued'
     ORDER BY o.seq ASC LIMIT 1;

    -- 2) File épuisée → re-scan des coursiers en ligne non encore sollicités
    IF NOT FOUND THEN
      SELECT pickup_lat, pickup_lng INTO v_plat, v_plng FROM public.deliveries WHERE id = p_delivery_id;
      IF v_plat IS NOT NULL THEN
        INSERT INTO public.delivery_offers (delivery_id, courier_id, distance_km, status, seq)
        SELECT p_delivery_id, n.courier_id, n.distance_km, 'queued',
               COALESCE((SELECT MAX(seq) FROM public.delivery_offers WHERE delivery_id = p_delivery_id), -1)
                 + ROW_NUMBER() OVER (ORDER BY n.distance_km)
        FROM public.nearby_couriers(v_plat, v_plng, 12000, 20) n
        WHERE n.courier_id NOT IN (SELECT courier_id FROM public.delivery_offers WHERE delivery_id = p_delivery_id);
        SELECT o.* INTO v_off FROM public.delivery_offers o
         WHERE o.delivery_id = p_delivery_id AND o.status = 'queued'
         ORDER BY o.seq ASC LIMIT 1;
      END IF;
    END IF;

    -- 3) Toujours personne → on s'arrête (no_courier)
    IF NOT FOUND THEN
      UPDATE public.deliveries SET status = 'no_courier'
       WHERE id = p_delivery_id AND status = 'searching';
      RETURN NULL;
    END IF;

    -- 4) Le coursier est-il ENCORE disponible ? Sinon on expire et on continue.
    SELECT c.id, c.user_id, c.name, c.phone, c.is_available, c.status
      INTO v_c FROM public.couriers c WHERE c.id = v_off.courier_id;
    IF NOT FOUND OR v_c.is_available IS NOT TRUE OR v_c.status <> 'active' THEN
      UPDATE public.delivery_offers SET status = 'expired', responded_at = now() WHERE id = v_off.id;
      CONTINUE;
    END IF;

    -- 5) Activation de l'offre (pending + expiration) + résurrection éventuelle
    UPDATE public.delivery_offers
       SET status = 'pending', offered_at = now(),
           expires_at = now() + make_interval(secs => GREATEST(p_duree_s, 10))
     WHERE id = v_off.id;
    UPDATE public.deliveries SET status = 'searching'
     WHERE id = p_delivery_id AND status = 'no_courier';

    RETURN jsonb_build_object('courier_id', v_c.id, 'user_id', v_c.user_id, 'name', v_c.name,
                              'phone', v_c.phone, 'distance_km', v_off.distance_km);
  END LOOP;

  RETURN NULL;
END;
$$;

-- ════════════════════════════════════════════════════════════════════════════
--  _free_courier_offers : libère les offres d'un coursier devenu occupé sur les
--  AUTRES courses en recherche, et relance la cascade de celles qu'il bloquait.
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public._free_courier_offers(p_courier_id uuid, p_except uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT o.delivery_id, bool_or(o.status = 'pending') AS was_active
      FROM public.delivery_offers o
      JOIN public.deliveries d ON d.id = o.delivery_id
     WHERE o.courier_id = p_courier_id
       AND o.status IN ('pending', 'queued')
       AND o.delivery_id <> COALESCE(p_except, '00000000-0000-0000-0000-000000000000'::uuid)
       AND d.status = 'searching' AND d.courier_id IS NULL
     GROUP BY o.delivery_id
  LOOP
    UPDATE public.delivery_offers SET status = 'expired', responded_at = now()
     WHERE delivery_id = r.delivery_id AND courier_id = p_courier_id AND status IN ('pending', 'queued');
    -- S'il bloquait l'offre active de cette course, on enchaîne sur le suivant.
    IF r.was_active THEN PERFORM public._activate_next_offer(r.delivery_id, 45); END IF;
  END LOOP;
END;
$$;

-- ════════════════════════════════════════════════════════════════════════════
--  accept_delivery (v2) : libère aussi les autres offres du coursier (anti-blocage)
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

  -- (2) libère ses offres sur les autres courses et relance leurs cascades
  PERFORM public._free_courier_offers(p_courier_id, p_delivery_id);

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
--  admin_assign_delivery (v2) : idem + libère les autres offres du coursier
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

  PERFORM public._free_courier_offers(p_courier_id, p_delivery_id);

  SELECT * INTO v_row FROM public.deliveries WHERE id = p_delivery_id;
  SELECT id, user_id, name, phone INTO v_c FROM public.couriers WHERE id = p_courier_id;
  RETURN jsonb_build_object('ok', true, 'delivery_id', p_delivery_id,
    'courier', jsonb_build_object('courier_id', v_c.id, 'user_id', v_c.user_id, 'name', v_c.name, 'phone', v_c.phone),
    'buyer_name', v_row.buyer_name, 'buyer_phone', v_row.buyer_phone);
END;
$$;

-- ════════════════════════════════════════════════════════════════════════════
--  dispatch_tick_all (v2) : avance les offres expirées ET ressuscite les courses
--  'no_courier' récentes (≤ 30 min) en re-scannant les coursiers fraîchement en ligne.
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.dispatch_tick_all()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  r RECORD;
  v_next jsonb;
  v_advanced integer := 0;
  v_revived  integer := 0;
  v_notify jsonb := '[]'::jsonb;
BEGIN
  -- A) Offres actives expirées → coursier suivant
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
        'name', v_next->>'name', 'phone', v_next->>'phone', 'distance_km', (v_next->>'distance_km')::numeric,
        'pickup_label', r.pickup_label, 'dropoff_label', r.dropoff_label,
        'course_km', r.distance_km, 'courier_payout', r.courier_payout, 'fee_fcfa', r.fee_fcfa));
    END IF;
  END LOOP;

  -- B) Courses 'no_courier' récentes → nouvelle tentative (coursiers fraîchement en ligne)
  FOR r IN
    SELECT d.id AS delivery_id, d.pickup_label, d.dropoff_label,
           d.distance_km, d.courier_payout, d.fee_fcfa
      FROM public.deliveries d
     WHERE d.status = 'no_courier' AND d.courier_id IS NULL
       AND d.pickup_lat IS NOT NULL
       AND COALESCE(d.created_at, now()) > now() - interval '30 minutes'
  LOOP
    v_next := public._activate_next_offer(r.delivery_id, 45);
    IF v_next IS NOT NULL THEN
      v_revived := v_revived + 1;
      v_notify := v_notify || jsonb_build_array(jsonb_build_object(
        'delivery_id', r.delivery_id, 'courier_id', v_next->>'courier_id', 'user_id', v_next->>'user_id',
        'name', v_next->>'name', 'phone', v_next->>'phone', 'distance_km', (v_next->>'distance_km')::numeric,
        'pickup_label', r.pickup_label, 'dropoff_label', r.dropoff_label,
        'course_km', r.distance_km, 'courier_payout', r.courier_payout, 'fee_fcfa', r.fee_fcfa));
    END IF;
  END LOOP;

  RETURN jsonb_build_object('advanced', v_advanced, 'revived', v_revived, 'notify', v_notify);
END;
$$;

-- ─── Droits ───────────────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public._activate_next_offer(uuid, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._free_courier_offers(uuid, uuid)    FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.accept_delivery(uuid, uuid)        TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_assign_delivery(uuid, uuid)  TO authenticated;
GRANT EXECUTE ON FUNCTION public.dispatch_tick_all()                TO authenticated;
