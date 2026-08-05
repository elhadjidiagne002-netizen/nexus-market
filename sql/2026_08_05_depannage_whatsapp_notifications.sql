-- ════════════════════════════════════════════════════════════════════════════
--  NEXUS Market — NEXUS Dépannage Auto : notifications WhatsApp (+ email admin)
--
--  Le vertical Dépannage Auto (sql/2026_08_04_nexus_depannage_auto.sql) était
--  livré sans aucune notification WhatsApp (différé explicitement en fin de
--  fichier). Ce fichier CREATE OR REPLACE les RPC concernées pour y ajouter un
--  appel best-effort à /api/rescue-notify (mirroir du pattern déjà utilisé par
--  order-email/offer-email/low-stock-email : secret depuis vault.decrypted_secrets
--  'nexus_internal_push_secret', header X-Internal-Secret, jamais d'exception
--  remontée — la notification ne doit JAMAIS casser la cascade/l'action).
--
--  Événements couverts : nouvelle offre (dépanneur), demande acceptée / aucun
--  dépanneur / en route / arrivé / terminée (demandeur + dépanneur) / annulée
--  (dépanneur) / nouveau dépanneur inscrit (admin).
--
--  Idempotent (CREATE OR REPLACE, les triggers/appelants restent inchangés).
-- ════════════════════════════════════════════════════════════════════════════

-- ─── 1. rescuer_register : notifie l'admin à la VRAIE inscription (pas à une
--        simple mise à jour de profil déjà existant). ────────────────────────
CREATE OR REPLACE FUNCTION public.rescuer_register(payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
  v_uid  uuid := auth.uid();
  v_lat  double precision := NULLIF(payload->>'lat','')::double precision;
  v_lng  double precision := NULLIF(payload->>'lng','')::double precision;
  v_specialties text[];
  v_row  public.rescuers%ROWTYPE;
  v_was_new boolean;
  v_secret text;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_authenticated'); END IF;

  v_was_new := NOT EXISTS (SELECT 1 FROM public.rescuers WHERE user_id = v_uid);

  SELECT COALESCE(array_agg(DISTINCT trim(both '"' from x)), '{}')
    INTO v_specialties
    FROM jsonb_array_elements_text(COALESCE(payload->'specialties', '[]'::jsonb)) x;

  INSERT INTO public.rescuers (user_id, name, phone, specialties, vehicle_type, is_available, status, updated_at)
  VALUES (v_uid, NULLIF(payload->>'name',''), NULLIF(payload->>'phone',''),
          v_specialties, NULLIF(payload->>'vehicle_type',''), true, 'active', now())
  ON CONFLICT (user_id) DO UPDATE SET
    name         = COALESCE(EXCLUDED.name, public.rescuers.name),
    phone        = COALESCE(EXCLUDED.phone, public.rescuers.phone),
    specialties  = CASE WHEN array_length(EXCLUDED.specialties,1) > 0 THEN EXCLUDED.specialties ELSE public.rescuers.specialties END,
    vehicle_type = COALESCE(EXCLUDED.vehicle_type, public.rescuers.vehicle_type),
    status       = 'active',
    updated_at   = now()
  RETURNING * INTO v_row;

  IF v_lat IS NOT NULL AND v_lng IS NOT NULL THEN
    UPDATE public.profiles
       SET is_rescuer = true, rescuer_status = 'available',
           current_lat = v_lat, current_lng = v_lng, location_updated_at = now()
     WHERE id = v_uid;
  ELSE
    UPDATE public.profiles SET is_rescuer = true, rescuer_status = 'available' WHERE id = v_uid;
  END IF;

  IF v_was_new THEN
    BEGIN
      SELECT decrypted_secret INTO v_secret
        FROM vault.decrypted_secrets WHERE name = 'nexus_internal_push_secret' LIMIT 1;
      IF v_secret IS NOT NULL THEN
        PERFORM net.http_post(
          url     := 'https://nexusmarket.sn/api/rescue-notify',
          headers := jsonb_build_object('Content-Type','application/json','X-Internal-Secret', v_secret),
          body    := jsonb_build_object('kind', 'admin_new_rescuer',
                       'rescuer_name', COALESCE(v_row.name, ''), 'rescuer_phone', COALESCE(v_row.phone, '')),
          timeout_milliseconds := 5000);
      END IF;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END IF;

  RETURN to_jsonb(v_row) || jsonb_build_object('ok', true);
END;
$$;

-- ─── 2. _activate_next_rescue_offer : WhatsApp au dépanneur à qui l'offre est
--        proposée (en plus de la notification in-app déjà existante), et au
--        demandeur si la cascade est épuisée (transition → no_rescuer, une
--        seule fois grâce au WHERE status='searching' de l'UPDATE existant). ─
CREATE OR REPLACE FUNCTION public._activate_next_rescue_offer(p_request_id uuid, p_duree_s integer DEFAULT 180)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
  v_off RECORD; v_r RECORD; v_req RECORD; v_guard integer := 0;
  v_secret text; v_became_no_rescuer boolean;
BEGIN
  SELECT location_lat, location_lng, location_label, issue_type, rescuer_payout, requester_phone
    INTO v_req FROM public.rescue_requests WHERE id = p_request_id;

  SELECT o.* INTO v_off FROM public.rescue_offers o
   WHERE o.request_id = p_request_id AND o.status = 'pending' ORDER BY o.seq ASC LIMIT 1;
  IF FOUND THEN
    SELECT r.user_id, r.name, r.phone INTO v_r FROM public.rescuers r WHERE r.user_id = v_off.rescuer_id;
    RETURN jsonb_build_object('rescuer_id', v_off.rescuer_id, 'user_id', v_off.rescuer_id,
      'name', v_r.name, 'phone', v_r.phone, 'distance_km', v_off.distance_km, 'expires_at', v_off.expires_at);
  END IF;

  LOOP
    v_guard := v_guard + 1; IF v_guard > 80 THEN EXIT; END IF;

    SELECT o.* INTO v_off FROM public.rescue_offers o
     WHERE o.request_id = p_request_id AND o.status = 'queued' ORDER BY o.seq ASC LIMIT 1;

    IF NOT FOUND THEN
      IF v_req.location_lat IS NOT NULL THEN
        INSERT INTO public.rescue_offers (request_id, rescuer_id, distance_km, status, seq)
        SELECT p_request_id, n.user_id, n.distance_km, 'queued',
               COALESCE((SELECT MAX(seq) FROM public.rescue_offers WHERE request_id = p_request_id), -1)
                 + ROW_NUMBER() OVER (ORDER BY n.distance_km)
        FROM public.nearby_rescuers(v_req.location_lat, v_req.location_lng, 30000, 20) n
        WHERE n.user_id NOT IN (SELECT rescuer_id FROM public.rescue_offers WHERE request_id = p_request_id);
        SELECT o.* INTO v_off FROM public.rescue_offers o
         WHERE o.request_id = p_request_id AND o.status = 'queued' ORDER BY o.seq ASC LIMIT 1;
      END IF;
    END IF;

    IF NOT FOUND THEN
      UPDATE public.rescue_requests SET status = 'no_rescuer' WHERE id = p_request_id AND status = 'searching';
      v_became_no_rescuer := FOUND;
      IF v_became_no_rescuer AND v_req.requester_phone IS NOT NULL THEN
        BEGIN
          SELECT decrypted_secret INTO v_secret
            FROM vault.decrypted_secrets WHERE name = 'nexus_internal_push_secret' LIMIT 1;
          IF v_secret IS NOT NULL THEN
            PERFORM net.http_post(
              url     := 'https://nexusmarket.sn/api/rescue-notify',
              headers := jsonb_build_object('Content-Type','application/json','X-Internal-Secret', v_secret),
              body    := jsonb_build_object('kind', 'no_rescuer', 'requester_phone', v_req.requester_phone),
              timeout_milliseconds := 5000);
          END IF;
        EXCEPTION WHEN OTHERS THEN NULL;
        END;
      END IF;
      RETURN NULL;
    END IF;

    SELECT r.user_id, r.name, r.phone, r.is_available, r.status
      INTO v_r FROM public.rescuers r WHERE r.user_id = v_off.rescuer_id;
    IF NOT FOUND OR v_r.is_available IS NOT TRUE OR v_r.status <> 'active' THEN
      UPDATE public.rescue_offers SET status = 'expired', responded_at = now() WHERE id = v_off.id;
      CONTINUE;
    END IF;

    UPDATE public.rescue_offers
       SET status = 'pending', offered_at = now(),
           expires_at = now() + make_interval(secs => GREATEST(p_duree_s, 10))
     WHERE id = v_off.id;
    UPDATE public.rescue_requests SET status = 'searching' WHERE id = p_request_id AND status = 'no_rescuer';

    BEGIN
      INSERT INTO public.notifications (user_id, type, title, message, link, read)
      VALUES (v_off.rescuer_id, 'offer',
              '🔧 SOS panne — 3 min pour accepter',
              COALESCE(v_req.location_label, 'Position du véhicule')
                || CASE WHEN v_req.rescuer_payout IS NOT NULL THEN ' · ' || v_req.rescuer_payout || ' FCFA' ELSE '' END,
              '/', false);
    EXCEPTION WHEN OTHERS THEN NULL;
    END;

    BEGIN
      IF v_r.phone IS NOT NULL THEN
        SELECT decrypted_secret INTO v_secret
          FROM vault.decrypted_secrets WHERE name = 'nexus_internal_push_secret' LIMIT 1;
        IF v_secret IS NOT NULL THEN
          PERFORM net.http_post(
            url     := 'https://nexusmarket.sn/api/rescue-notify',
            headers := jsonb_build_object('Content-Type','application/json','X-Internal-Secret', v_secret),
            body    := jsonb_build_object('kind', 'offer_new', 'rescuer_phone', v_r.phone,
                         'location_label', COALESCE(v_req.location_label, 'Position du véhicule'),
                         'rescuer_payout', v_req.rescuer_payout),
            timeout_milliseconds := 5000);
        END IF;
      END IF;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;

    RETURN jsonb_build_object('rescuer_id', v_off.rescuer_id, 'user_id', v_off.rescuer_id,
      'name', v_r.name, 'phone', v_r.phone, 'distance_km', v_off.distance_km,
      'expires_at', now() + make_interval(secs => GREATEST(p_duree_s, 10)));
  END LOOP;
  RETURN NULL;
END;
$$;

-- ─── 3. accept_rescue_request : WhatsApp au demandeur (dépanneur trouvé). ────
CREATE OR REPLACE FUNCTION public.accept_rescue_request(p_request_id uuid, p_rescuer_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE v_ok boolean := false; v_row rescue_requests%ROWTYPE; v_r RECORD; v_secret text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.rescue_offers
     WHERE request_id = p_request_id AND rescuer_id = p_rescuer_id AND status = 'pending') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_your_turn');
  END IF;

  UPDATE public.rescue_requests SET rescuer_id = p_rescuer_id, status = 'accepted', assigned_at = now()
   WHERE id = p_request_id AND rescuer_id IS NULL AND status IN ('searching','no_rescuer')
  RETURNING true INTO v_ok;
  IF v_ok IS NULL OR v_ok = false THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_taken');
  END IF;

  UPDATE public.rescue_offers SET status = 'accepted', responded_at = now()
   WHERE request_id = p_request_id AND rescuer_id = p_rescuer_id;
  UPDATE public.rescue_offers SET status = 'expired', responded_at = now()
   WHERE request_id = p_request_id AND rescuer_id <> p_rescuer_id AND status IN ('pending','queued');

  UPDATE public.rescuers SET is_available = false WHERE user_id = p_rescuer_id;
  UPDATE public.profiles SET rescuer_status = 'busy' WHERE id = p_rescuer_id;

  SELECT * INTO v_row FROM public.rescue_requests WHERE id = p_request_id;
  SELECT name, phone INTO v_r FROM public.rescuers WHERE user_id = p_rescuer_id;

  BEGIN
    IF v_row.requester_phone IS NOT NULL THEN
      SELECT decrypted_secret INTO v_secret
        FROM vault.decrypted_secrets WHERE name = 'nexus_internal_push_secret' LIMIT 1;
      IF v_secret IS NOT NULL THEN
        PERFORM net.http_post(
          url     := 'https://nexusmarket.sn/api/rescue-notify',
          headers := jsonb_build_object('Content-Type','application/json','X-Internal-Secret', v_secret),
          body    := jsonb_build_object('kind', 'accepted', 'requester_phone', v_row.requester_phone,
                       'rescuer_name', COALESCE(v_r.name, ''), 'rescuer_phone', COALESCE(v_r.phone, '')),
          timeout_milliseconds := 5000);
      END IF;
    END IF;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  RETURN jsonb_build_object('ok', true, 'request_id', p_request_id,
    'requester_name', v_row.requester_name, 'requester_phone', v_row.requester_phone,
    'location_label', v_row.location_label, 'location_lat', v_row.location_lat, 'location_lng', v_row.location_lng,
    'issue_type', v_row.issue_type, 'description', v_row.description, 'vehicle_info', v_row.vehicle_info,
    'rescuer_payout', v_row.rescuer_payout);
END;
$$;

-- ─── 4. admin_assign_rescue : même notification que l'acceptation normale. ──
CREATE OR REPLACE FUNCTION public.admin_assign_rescue(p_request_id uuid, p_rescuer_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE v_row rescue_requests%ROWTYPE; v_r RECORD; v_secret text;
BEGIN
  UPDATE public.rescue_requests SET rescuer_id = p_rescuer_id, status = 'accepted', assigned_at = now()
   WHERE id = p_request_id;

  UPDATE public.rescue_offers SET status = 'expired', responded_at = now()
   WHERE request_id = p_request_id AND status IN ('pending','queued');
  INSERT INTO public.rescue_offers (request_id, rescuer_id, status, seq, responded_at)
  VALUES (p_request_id, p_rescuer_id, 'accepted', -1, now()) ON CONFLICT DO NOTHING;

  UPDATE public.rescuers SET is_available = false WHERE user_id = p_rescuer_id;
  UPDATE public.profiles SET rescuer_status = 'busy' WHERE id = p_rescuer_id;

  SELECT * INTO v_row FROM public.rescue_requests WHERE id = p_request_id;
  SELECT user_id, name, phone INTO v_r FROM public.rescuers WHERE user_id = p_rescuer_id;

  BEGIN
    IF v_row.requester_phone IS NOT NULL THEN
      SELECT decrypted_secret INTO v_secret
        FROM vault.decrypted_secrets WHERE name = 'nexus_internal_push_secret' LIMIT 1;
      IF v_secret IS NOT NULL THEN
        PERFORM net.http_post(
          url     := 'https://nexusmarket.sn/api/rescue-notify',
          headers := jsonb_build_object('Content-Type','application/json','X-Internal-Secret', v_secret),
          body    := jsonb_build_object('kind', 'accepted', 'requester_phone', v_row.requester_phone,
                       'rescuer_name', COALESCE(v_r.name, ''), 'rescuer_phone', COALESCE(v_r.phone, '')),
          timeout_milliseconds := 5000);
      END IF;
    END IF;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  RETURN jsonb_build_object('ok', true, 'request_id', p_request_id,
    'rescuer', jsonb_build_object('user_id', v_r.user_id, 'name', v_r.name, 'phone', v_r.phone),
    'requester_name', v_row.requester_name, 'requester_phone', v_row.requester_phone);
END;
$$;

-- ─── 5. set_rescue_progress : WhatsApp au demandeur (en route / arrivé). ─────
CREATE OR REPLACE FUNCTION public.set_rescue_progress(p_request_id uuid, p_status text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE v_uid uuid := auth.uid(); v_row rescue_requests%ROWTYPE; v_r RECORD; v_secret text; v_ok boolean;
BEGIN
  IF p_status NOT IN ('en_route','arrived') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_status');
  END IF;
  UPDATE public.rescue_requests SET status = p_status
   WHERE id = p_request_id AND rescuer_id = v_uid AND status IN ('accepted','en_route')
  RETURNING true INTO v_ok;

  IF v_ok THEN
    SELECT * INTO v_row FROM public.rescue_requests WHERE id = p_request_id;
    SELECT name INTO v_r FROM public.rescuers WHERE user_id = v_uid;
    BEGIN
      IF v_row.requester_phone IS NOT NULL THEN
        SELECT decrypted_secret INTO v_secret
          FROM vault.decrypted_secrets WHERE name = 'nexus_internal_push_secret' LIMIT 1;
        IF v_secret IS NOT NULL THEN
          PERFORM net.http_post(
            url     := 'https://nexusmarket.sn/api/rescue-notify',
            headers := jsonb_build_object('Content-Type','application/json','X-Internal-Secret', v_secret),
            body    := jsonb_build_object('kind', CASE WHEN p_status = 'en_route' THEN 'en_route' ELSE 'arrived' END,
                         'requester_phone', v_row.requester_phone, 'rescuer_name', COALESCE(v_r.name, '')),
            timeout_milliseconds := 5000);
        END IF;
      END IF;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END IF;

  RETURN jsonb_build_object('ok', true, 'status', p_status);
END;
$$;

-- ─── 6. complete_rescue_request : WhatsApp demandeur + dépanneur. ────────────
CREATE OR REPLACE FUNCTION public.complete_rescue_request(p_request_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
  v_d rescue_requests%ROWTYPE; v_rid uuid; v_uid uuid := auth.uid(); v_payout integer;
  v_rescuer_phone text; v_secret text;
BEGIN
  SELECT * INTO v_d FROM public.rescue_requests WHERE id = p_request_id;
  IF v_d.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_found'); END IF;

  IF NOT (v_d.rescuer_id = v_uid OR public.is_admin()) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'forbidden');
  END IF;
  IF v_d.status = 'completed' THEN RETURN jsonb_build_object('ok', true, 'already', true); END IF;

  UPDATE public.rescue_requests SET status = 'completed', completed_at = now() WHERE id = p_request_id;

  v_payout := COALESCE(v_d.rescuer_payout, 0);
  SELECT id INTO v_rid FROM public.rescuers WHERE user_id = v_d.rescuer_id LIMIT 1;

  IF v_rid IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.rescuer_earnings WHERE request_id = p_request_id) THEN
      INSERT INTO public.rescuer_earnings (rescuer_id, request_id, amount, type, status)
      VALUES (v_rid, p_request_id, v_payout, 'rescue', 'pending');
      UPDATE public.rescuers
         SET total_earned = COALESCE(total_earned, 0) + v_payout,
             interventions_done = COALESCE(interventions_done, 0) + 1
       WHERE id = v_rid;
    END IF;
    UPDATE public.rescuers SET is_available = true WHERE id = v_rid;
  END IF;

  IF v_d.rescuer_id IS NOT NULL THEN
    UPDATE public.profiles SET rescuer_status = 'available' WHERE id = v_d.rescuer_id;
    SELECT phone INTO v_rescuer_phone FROM public.rescuers WHERE user_id = v_d.rescuer_id;
  END IF;

  BEGIN
    IF v_d.requester_phone IS NOT NULL OR v_rescuer_phone IS NOT NULL THEN
      SELECT decrypted_secret INTO v_secret
        FROM vault.decrypted_secrets WHERE name = 'nexus_internal_push_secret' LIMIT 1;
      IF v_secret IS NOT NULL THEN
        PERFORM net.http_post(
          url     := 'https://nexusmarket.sn/api/rescue-notify',
          headers := jsonb_build_object('Content-Type','application/json','X-Internal-Secret', v_secret),
          body    := jsonb_build_object('kind', 'completed',
                       'requester_phone', v_d.requester_phone,
                       'rescuer_phone', v_rescuer_phone, 'payout_fcfa', v_payout),
          timeout_milliseconds := 5000);
      END IF;
    END IF;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  RETURN jsonb_build_object('ok', true, 'payout', v_payout, 'requester_id', v_d.requester_id);
END;
$$;

-- ─── 7. cancel_rescue_request : WhatsApp au dépanneur si déjà assigné. ───────
CREATE OR REPLACE FUNCTION public.cancel_rescue_request(p_request_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE v_d rescue_requests%ROWTYPE; v_uid uuid := auth.uid(); v_r RECORD; v_secret text;
BEGIN
  SELECT * INTO v_d FROM public.rescue_requests WHERE id = p_request_id;
  IF v_d.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_found'); END IF;
  IF NOT (v_d.requester_id = v_uid OR public.is_admin()) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'forbidden');
  END IF;
  IF v_d.status IN ('completed','cancelled') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_closed');
  END IF;

  UPDATE public.rescue_requests SET status = 'cancelled', cancelled_at = now() WHERE id = p_request_id;
  UPDATE public.rescue_offers SET status = 'expired', responded_at = now()
   WHERE request_id = p_request_id AND status IN ('pending','queued');

  IF v_d.rescuer_id IS NOT NULL THEN
    UPDATE public.rescuers SET is_available = true WHERE user_id = v_d.rescuer_id;
    UPDATE public.profiles SET rescuer_status = 'available' WHERE id = v_d.rescuer_id;

    SELECT phone INTO v_r FROM public.rescuers WHERE user_id = v_d.rescuer_id;
    BEGIN
      IF v_r.phone IS NOT NULL THEN
        SELECT decrypted_secret INTO v_secret
          FROM vault.decrypted_secrets WHERE name = 'nexus_internal_push_secret' LIMIT 1;
        IF v_secret IS NOT NULL THEN
          PERFORM net.http_post(
            url     := 'https://nexusmarket.sn/api/rescue-notify',
            headers := jsonb_build_object('Content-Type','application/json','X-Internal-Secret', v_secret),
            body    := jsonb_build_object('kind', 'cancelled', 'rescuer_phone', v_r.phone),
            timeout_milliseconds := 5000);
        END IF;
      END IF;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END IF;
  RETURN jsonb_build_object('ok', true);
END;
$$;

-- ════════════════════════════════════════════════════════════════════════════
--  FIN — les GRANT EXECUTE existants restent valides (CREATE OR REPLACE ne
--  change pas la signature). Rien d'autre à modifier.
-- ════════════════════════════════════════════════════════════════════════════
