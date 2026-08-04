-- ════════════════════════════════════════════════════════════════════════════
--  NEXUS Market — Vertical « NEXUS Dépannage Auto » 🔧🚗
--  (mécanicien / dépanneuse à la demande, géolocalisé, cascade d'offres)
--
--  Copie fidèle de l'architecture coursier (deliveries/delivery_offers,
--  cascade 3 min, rayon 30 km, auto-réparation, pg_cron 1/min) appliquée à un
--  nouveau type de prestataire : rescuers/rescue_requests/rescue_offers.
--  AUCUNE table coursier n'est touchée — verticaux totalement indépendants,
--  seule la position (profiles.current_lat/current_lng/geolocation, déjà
--  générique) et le helper is_admin() sont réutilisés.
--
--  Convention (héritée du correctif 2026_06_09_dispatch_userid_fix, appliquée
--  ici dès le départ pour ne pas reproduire le bug) :
--    rescue_requests.rescuer_id = rescue_offers.rescuer_id = ID UTILISATEUR
--    (auth.uid() = profiles.id = rescuers.user_id), JAMAIS rescuers.id.
--
--  Idempotent / rejouable. À exécuter dans Supabase → SQL Editor.
-- ════════════════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS postgis WITH SCHEMA extensions;
SET search_path = public, extensions;

-- ─── 1. Flag profil + colonnes de présence (mêmes noms que courier_status) ───
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_rescuer boolean NOT NULL DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS rescuer_status text; -- available | busy | offline

CREATE INDEX IF NOT EXISTS idx_profiles_rescuer_geo
  ON public.profiles USING GIST (geolocation) WHERE is_rescuer = true;

-- ─── 2. Fiche métier du dépanneur (1 ligne / utilisateur) ────────────────────
CREATE TABLE IF NOT EXISTS public.rescuers (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name               text,
  phone              text,
  specialties        text[] NOT NULL DEFAULT '{}',  -- mechanic|tow_truck|battery|tire|fuel|lockout
  vehicle_type       text,                           -- moto | pickup | dépanneuse
  is_available       boolean NOT NULL DEFAULT true,
  status             text NOT NULL DEFAULT 'active', -- active | suspended
  rating_avg         numeric(3,2) NOT NULL DEFAULT 0,
  rating_count       integer NOT NULL DEFAULT 0,
  interventions_done integer NOT NULL DEFAULT 0,
  total_earned       integer NOT NULL DEFAULT 0,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_rescuers_user_id ON public.rescuers(user_id);
CREATE INDEX IF NOT EXISTS idx_rescuers_status ON public.rescuers(status) WHERE status = 'active';

-- ─── 3. Demande de dépannage (« SOS panne ») ─────────────────────────────────
CREATE TABLE IF NOT EXISTS public.rescue_requests (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id     uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  requester_name   text,
  requester_phone  text,
  issue_type       text NOT NULL DEFAULT 'breakdown', -- breakdown|flat_tire|battery|fuel|lockout|tow|other
  description      text,
  vehicle_info     text,
  status           text NOT NULL DEFAULT 'searching',
    -- searching | no_rescuer | accepted | en_route | arrived | completed | cancelled
  location_zone    text,
  location_label   text,
  location_lat     double precision,
  location_lng     double precision,
  rescuer_lat      double precision,  -- position live du dépanneur en route (suivi demandeur)
  rescuer_lng      double precision,
  fee_fcfa         integer NOT NULL DEFAULT 0,
  rescuer_payout   integer NOT NULL DEFAULT 0,
  commission_fcfa  integer NOT NULL DEFAULT 0,
  payment_method   text,
  rescuer_id       uuid,  -- = profiles.id (voir convention en tête de fichier), PAS rescuers.id
  assigned_at      timestamptz,
  completed_at     timestamptz,
  cancelled_at     timestamptz,
  rescuer_rating   smallint,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rescue_requests_requester ON public.rescue_requests(requester_id);
CREATE INDEX IF NOT EXISTS idx_rescue_requests_rescuer   ON public.rescue_requests(rescuer_id);
CREATE INDEX IF NOT EXISTS idx_rescue_requests_status    ON public.rescue_requests(status);

-- ─── 4. File d'offres (cascade, identique à delivery_offers) ────────────────
CREATE TABLE IF NOT EXISTS public.rescue_offers (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id    uuid NOT NULL REFERENCES public.rescue_requests(id) ON DELETE CASCADE,
  rescuer_id    uuid NOT NULL, -- = profiles.id
  distance_km   numeric,
  status        text NOT NULL DEFAULT 'queued', -- queued|pending|accepted|declined|expired
  seq           integer,
  offered_at    timestamptz,
  expires_at    timestamptz,
  responded_at  timestamptz
);

CREATE INDEX IF NOT EXISTS idx_rescue_offers_req_seq ON public.rescue_offers(request_id, seq);
CREATE INDEX IF NOT EXISTS idx_rescue_offers_rescuer  ON public.rescue_offers(rescuer_id, status);

-- ─── 5. Gains du dépanneur (mirroir courier_earnings) ────────────────────────
CREATE TABLE IF NOT EXISTS public.rescuer_earnings (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rescuer_id  uuid NOT NULL REFERENCES public.rescuers(id) ON DELETE CASCADE,
  request_id  uuid REFERENCES public.rescue_requests(id) ON DELETE SET NULL,
  amount      integer NOT NULL DEFAULT 0,
  type        text NOT NULL DEFAULT 'rescue',
  status      text NOT NULL DEFAULT 'pending', -- pending|paid
  created_at  timestamptz NOT NULL DEFAULT now(),
  paid_at     timestamptz
);

CREATE INDEX IF NOT EXISTS idx_rescuer_earnings_rescuer ON public.rescuer_earnings(rescuer_id, status);

-- ─── 6. RLS ───────────────────────────────────────────────────────────────
ALTER TABLE public.rescuers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rescue_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rescue_offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rescuer_earnings ENABLE ROW LEVEL SECURITY;

-- rescuers : lecture publique des fiches actives (nécessaire à l'affichage
-- nom/téléphone une fois l'offre acceptée), écriture = propriétaire, admin = tout.
DROP POLICY IF EXISTS rescuers_select_public ON public.rescuers;
CREATE POLICY rescuers_select_public ON public.rescuers
  FOR SELECT USING (status = 'active' OR user_id = auth.uid() OR is_admin());
DROP POLICY IF EXISTS rescuers_modify_own ON public.rescuers;
CREATE POLICY rescuers_modify_own ON public.rescuers
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS rescuers_admin_all ON public.rescuers;
CREATE POLICY rescuers_admin_all ON public.rescuers
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- rescue_requests : demandeur propriétaire, dépanneur assigné, admin.
DROP POLICY IF EXISTS rescue_req_requester_own ON public.rescue_requests;
CREATE POLICY rescue_req_requester_own ON public.rescue_requests
  FOR ALL USING (requester_id = auth.uid()) WITH CHECK (requester_id = auth.uid());
DROP POLICY IF EXISTS rescue_req_rescuer_assigned ON public.rescue_requests;
CREATE POLICY rescue_req_rescuer_assigned ON public.rescue_requests
  FOR SELECT USING (rescuer_id = auth.uid());
DROP POLICY IF EXISTS rescue_req_rescuer_update ON public.rescue_requests;
CREATE POLICY rescue_req_rescuer_update ON public.rescue_requests
  FOR UPDATE USING (rescuer_id = auth.uid()) WITH CHECK (rescuer_id = auth.uid());
DROP POLICY IF EXISTS rescue_req_admin_all ON public.rescue_requests;
CREATE POLICY rescue_req_admin_all ON public.rescue_requests
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- rescue_offers : le dépanneur voit/gère SES offres, admin = tout. Les écritures
-- de la cascade passent par des RPC SECURITY DEFINER (contournent la RLS).
DROP POLICY IF EXISTS rescue_offers_own ON public.rescue_offers;
CREATE POLICY rescue_offers_own ON public.rescue_offers
  FOR SELECT USING (rescuer_id = auth.uid());
DROP POLICY IF EXISTS rescue_offers_admin_all ON public.rescue_offers;
CREATE POLICY rescue_offers_admin_all ON public.rescue_offers
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- rescuer_earnings : le dépanneur voit SES gains, admin = tout.
DROP POLICY IF EXISTS rescuer_earnings_own ON public.rescuer_earnings;
CREATE POLICY rescuer_earnings_own ON public.rescuer_earnings
  FOR SELECT USING (rescuer_id IN (SELECT id FROM public.rescuers WHERE user_id = auth.uid()));
DROP POLICY IF EXISTS rescuer_earnings_admin_all ON public.rescuer_earnings;
CREATE POLICY rescuer_earnings_admin_all ON public.rescuer_earnings
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- ════════════════════════════════════════════════════════════════════════════
--  7. RPC rescuer_register(payload) : inscription / mise à jour du dépanneur.
-- ════════════════════════════════════════════════════════════════════════════
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
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_authenticated'); END IF;

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

  RETURN to_jsonb(v_row) || jsonb_build_object('ok', true);
END;
$$;

-- ════════════════════════════════════════════════════════════════════════════
--  8. RPC rescuer_set_status(status, lat, lng) : en ligne / hors ligne + position.
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.rescuer_set_status(p_status text, p_lat double precision DEFAULT NULL, p_lng double precision DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RETURN; END IF;
  UPDATE public.profiles
     SET rescuer_status = p_status,
         current_lat = COALESCE(p_lat, current_lat),
         current_lng = COALESCE(p_lng, current_lng),
         location_updated_at = CASE WHEN p_lat IS NOT NULL THEN now() ELSE location_updated_at END
   WHERE id = v_uid;
  IF p_status <> 'busy' THEN
    UPDATE public.rescuers SET is_available = (p_status = 'available') WHERE user_id = v_uid;
  END IF;
END;
$$;

-- ════════════════════════════════════════════════════════════════════════════
--  9. RPC rescuer_ping(lat,lng) : position live, propagée à la course active
--     (mirroir courier_ping).
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.rescuer_ping(p_lat double precision, p_lng double precision)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL OR p_lat IS NULL OR p_lng IS NULL THEN RETURN; END IF;
  UPDATE public.profiles SET current_lat = p_lat, current_lng = p_lng, location_updated_at = now() WHERE id = v_uid;
  UPDATE public.rescue_requests SET rescuer_lat = p_lat, rescuer_lng = p_lng
   WHERE rescuer_id = v_uid AND status IN ('accepted','en_route');
END;
$$;

-- ════════════════════════════════════════════════════════════════════════════
--  10. RPC nearby_rescuers(lat,lng,radius_m,limit,specialty)
-- ════════════════════════════════════════════════════════════════════════════
DROP FUNCTION IF EXISTS public.nearby_rescuers(double precision, double precision, integer, integer, text);
CREATE OR REPLACE FUNCTION public.nearby_rescuers(
  p_lat        double precision,
  p_lng        double precision,
  p_radius_m   integer DEFAULT 30000,
  p_limit      integer DEFAULT 20,
  p_specialty  text    DEFAULT NULL
)
RETURNS TABLE (
  rescuer_id   uuid,
  user_id      uuid,
  name         text,
  phone        text,
  specialties  text[],
  vehicle_type text,
  distance_km  numeric,
  rating_avg   numeric
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, extensions
AS $$
  SELECT
    r.id, r.user_id, r.name, r.phone, r.specialties, r.vehicle_type,
    ROUND((ST_Distance(p.geolocation,
      ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography) / 1000.0)::numeric, 2) AS distance_km,
    r.rating_avg
  FROM public.rescuers r
  JOIN public.profiles p ON p.id = r.user_id
  WHERE r.is_available = true
    AND r.status = 'active'
    AND p.geolocation IS NOT NULL
    AND (p.location_updated_at IS NULL OR p.location_updated_at > now() - interval '15 minutes')
    AND (p_specialty IS NULL OR p_specialty = '' OR p_specialty = ANY(r.specialties))
    AND ST_DWithin(p.geolocation, ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography, GREATEST(p_radius_m, 0))
  ORDER BY p.geolocation <-> ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography
  LIMIT GREATEST(p_limit, 1);
$$;

-- ════════════════════════════════════════════════════════════════════════════
--  11. Cascade — _activate_next_rescue_offer (mirroir _activate_next_offer)
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public._activate_next_rescue_offer(p_request_id uuid, p_duree_s integer DEFAULT 180)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
  v_off RECORD; v_r RECORD; v_req RECORD; v_guard integer := 0;
BEGIN
  SELECT location_lat, location_lng, location_label, issue_type, rescuer_payout
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

    RETURN jsonb_build_object('rescuer_id', v_off.rescuer_id, 'user_id', v_off.rescuer_id,
      'name', v_r.name, 'phone', v_r.phone, 'distance_km', v_off.distance_km,
      'expires_at', now() + make_interval(secs => GREATEST(p_duree_s, 10)));
  END LOOP;
  RETURN NULL;
END;
$$;

-- ════════════════════════════════════════════════════════════════════════════
--  12. RPC create_rescue_request(payload) : SOS panne.
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.create_rescue_request(payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
  v_id uuid;
  v_lat double precision := NULLIF(payload->>'location_lat','')::double precision;
  v_lng double precision := NULLIF(payload->>'location_lng','')::double precision;
  v_active jsonb := NULL; v_row rescue_requests%ROWTYPE;
BEGIN
  INSERT INTO public.rescue_requests (
    requester_id, requester_name, requester_phone, issue_type, description, vehicle_info,
    status, location_zone, location_label, location_lat, location_lng,
    fee_fcfa, rescuer_payout, commission_fcfa, payment_method
  ) VALUES (
    NULLIF(payload->>'requester_id','')::uuid, payload->>'requester_name', payload->>'requester_phone',
    COALESCE(NULLIF(payload->>'issue_type',''), 'breakdown'), payload->>'description', payload->>'vehicle_info',
    'searching', payload->>'location_zone', payload->>'location_label', v_lat, v_lng,
    COALESCE(NULLIF(payload->>'fee_fcfa','')::integer, 0),
    COALESCE(NULLIF(payload->>'rescuer_payout','')::integer, 0),
    COALESCE(NULLIF(payload->>'commission_fcfa','')::integer, 0),
    payload->>'payment_method'
  ) RETURNING id INTO v_id;

  IF v_lat IS NOT NULL AND v_lng IS NOT NULL THEN
    INSERT INTO public.rescue_offers (request_id, rescuer_id, distance_km, status, seq)
    SELECT v_id, n.user_id, n.distance_km, 'queued', (ROW_NUMBER() OVER (ORDER BY n.distance_km)) - 1
    FROM public.nearby_rescuers(v_lat, v_lng, 30000, 20) n;
    v_active := public._activate_next_rescue_offer(v_id);
  END IF;

  SELECT * INTO v_row FROM public.rescue_requests WHERE id = v_id;
  RETURN to_jsonb(v_row) || jsonb_build_object(
    'notified_rescuers', CASE WHEN v_active IS NULL THEN '[]'::jsonb ELSE jsonb_build_array(v_active) END,
    'active_rescuer', v_active);
END;
$$;

-- ════════════════════════════════════════════════════════════════════════════
--  13. accept / decline / tick / admin_assign (mirroir coursier, convention userid)
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.accept_rescue_request(p_request_id uuid, p_rescuer_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE v_ok boolean := false; v_row rescue_requests%ROWTYPE;
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
  RETURN jsonb_build_object('ok', true, 'request_id', p_request_id,
    'requester_name', v_row.requester_name, 'requester_phone', v_row.requester_phone,
    'location_label', v_row.location_label, 'location_lat', v_row.location_lat, 'location_lng', v_row.location_lng,
    'issue_type', v_row.issue_type, 'description', v_row.description, 'vehicle_info', v_row.vehicle_info,
    'rescuer_payout', v_row.rescuer_payout);
END;
$$;

CREATE OR REPLACE FUNCTION public.decline_rescue_request(p_request_id uuid, p_rescuer_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE v_next jsonb; v_row rescue_requests%ROWTYPE;
BEGIN
  SELECT * INTO v_row FROM public.rescue_requests WHERE id = p_request_id;
  IF v_row.status NOT IN ('searching','no_rescuer') OR v_row.rescuer_id IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_searching');
  END IF;

  UPDATE public.rescue_offers SET status = 'declined', responded_at = now()
   WHERE request_id = p_request_id AND rescuer_id = p_rescuer_id AND status = 'pending';

  v_next := public._activate_next_rescue_offer(p_request_id);
  RETURN jsonb_build_object('ok', true, 'exhausted', (v_next IS NULL), 'next_rescuer', v_next,
    'location_label', v_row.location_label, 'issue_type', v_row.issue_type, 'rescuer_payout', v_row.rescuer_payout);
END;
$$;

CREATE OR REPLACE FUNCTION public.rescue_dispatch_tick(p_request_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE v_off RECORD; v_next jsonb; v_row rescue_requests%ROWTYPE;
BEGIN
  SELECT * INTO v_row FROM public.rescue_requests WHERE id = p_request_id;
  IF v_row.status NOT IN ('searching','no_rescuer') OR v_row.rescuer_id IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'state', COALESCE(v_row.status,'unknown'));
  END IF;
  SELECT * INTO v_off FROM public.rescue_offers
   WHERE request_id = p_request_id AND status = 'pending' ORDER BY seq ASC LIMIT 1;
  IF v_off IS NOT NULL AND v_off.expires_at IS NOT NULL AND v_off.expires_at < now() THEN
    UPDATE public.rescue_offers SET status = 'expired', responded_at = now() WHERE id = v_off.id;
    v_next := public._activate_next_rescue_offer(p_request_id);
    RETURN jsonb_build_object('ok', true, 'state', 'advanced', 'exhausted', (v_next IS NULL), 'next_rescuer', v_next);
  END IF;
  RETURN jsonb_build_object('ok', true, 'state', 'searching');
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_assign_rescue(p_request_id uuid, p_rescuer_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE v_row rescue_requests%ROWTYPE; v_r RECORD;
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
  RETURN jsonb_build_object('ok', true, 'request_id', p_request_id,
    'rescuer', jsonb_build_object('user_id', v_r.user_id, 'name', v_r.name, 'phone', v_r.phone),
    'requester_name', v_row.requester_name, 'requester_phone', v_row.requester_phone);
END;
$$;

-- ════════════════════════════════════════════════════════════════════════════
--  14. Cycle de vie côté dépanneur : en route / arrivé / terminé + notation.
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.set_rescue_progress(p_request_id uuid, p_status text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF p_status NOT IN ('en_route','arrived') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_status');
  END IF;
  UPDATE public.rescue_requests SET status = p_status
   WHERE id = p_request_id AND rescuer_id = v_uid AND status IN ('accepted','en_route');
  RETURN jsonb_build_object('ok', true, 'status', p_status);
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_rescue_request(p_request_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
  v_d rescue_requests%ROWTYPE; v_rid uuid; v_uid uuid := auth.uid(); v_payout integer;
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
  END IF;

  RETURN jsonb_build_object('ok', true, 'payout', v_payout, 'requester_id', v_d.requester_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_rescue_request(p_request_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE v_d rescue_requests%ROWTYPE; v_uid uuid := auth.uid();
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
  END IF;
  RETURN jsonb_build_object('ok', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.rate_rescuer(p_request_id uuid, p_rating smallint)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE v_d rescue_requests%ROWTYPE; v_rid uuid; v_uid uuid := auth.uid();
BEGIN
  IF p_rating < 1 OR p_rating > 5 THEN RETURN jsonb_build_object('ok', false, 'reason', 'invalid_rating'); END IF;
  SELECT * INTO v_d FROM public.rescue_requests WHERE id = p_request_id;
  IF v_d.id IS NULL OR v_d.requester_id <> v_uid THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'forbidden');
  END IF;
  IF v_d.rescuer_rating IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_rated');
  END IF;

  UPDATE public.rescue_requests SET rescuer_rating = p_rating WHERE id = p_request_id;
  SELECT id INTO v_rid FROM public.rescuers WHERE user_id = v_d.rescuer_id;
  IF v_rid IS NOT NULL THEN
    UPDATE public.rescuers
       SET rating_avg = ROUND(((rating_avg * rating_count) + p_rating) / (rating_count + 1), 2),
           rating_count = rating_count + 1
     WHERE id = v_rid;
  END IF;
  RETURN jsonb_build_object('ok', true);
END;
$$;

-- ════════════════════════════════════════════════════════════════════════════
--  15. rescue_dispatch_tick_all() — timeouts + filet + auto-réparation.
--      pg_cron dédié (job séparé du coursier, même cadence 1/min).
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.rescue_dispatch_tick_all()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE r RECORD; v_next jsonb; v_advanced integer := 0; v_healed integer := 0;
BEGIN
  -- Auto-réparation : dépanneur actif, voulu en ligne, sans course en cours,
  -- mais is_available resté bloqué à false.
  UPDATE public.rescuers rc SET is_available = true
   WHERE rc.status = 'active' AND rc.is_available = false
     AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = rc.user_id AND p.rescuer_status = 'available')
     AND NOT EXISTS (SELECT 1 FROM public.rescue_requests rr
                      WHERE rr.rescuer_id = rc.user_id AND rr.status IN ('accepted','en_route','arrived'));
  GET DIAGNOSTICS v_healed = ROW_COUNT;

  -- Offres expirées (> 3 min) → dépanneur suivant.
  FOR r IN
    SELECT rr.id AS request_id, o.id AS offer_id
      FROM public.rescue_requests rr
      JOIN public.rescue_offers o ON o.request_id = rr.id AND o.status = 'pending'
     WHERE rr.status = 'searching' AND rr.rescuer_id IS NULL
       AND o.expires_at IS NOT NULL AND o.expires_at < now()
  LOOP
    UPDATE public.rescue_offers SET status = 'expired', responded_at = now() WHERE id = r.offer_id;
    v_next := public._activate_next_rescue_offer(r.request_id);
    v_advanced := v_advanced + 1;
  END LOOP;

  -- Filet de sécurité : demandes sans dépanneur ni offre active (< 24 h).
  FOR r IN
    SELECT rr.id AS request_id
      FROM public.rescue_requests rr
     WHERE rr.rescuer_id IS NULL
       AND rr.status IN ('searching','no_rescuer')
       AND rr.location_lat IS NOT NULL AND rr.location_lng IS NOT NULL
       AND rr.created_at > now() - interval '24 hours'
       AND NOT EXISTS (SELECT 1 FROM public.rescue_offers o WHERE o.request_id = rr.id AND o.status = 'pending')
     ORDER BY rr.created_at ASC
     LIMIT 100
  LOOP
    v_next := public._activate_next_rescue_offer(r.request_id);
    IF v_next IS NOT NULL THEN v_advanced := v_advanced + 1; END IF;
  END LOOP;

  RETURN jsonb_build_object('advanced', v_advanced, 'healed', v_healed, 'mode', 'rescue_cascade_180s_r30');
END;
$$;

CREATE EXTENSION IF NOT EXISTS pg_cron;
SELECT cron.schedule('nexus-rescue-dispatch-tick', '* * * * *', 'select public.rescue_dispatch_tick_all();');

-- ─── 16. Notification type ────────────────────────────────────────────────
-- 'offer' est déjà une valeur valide de notifications_type_check (réutilisée
-- pour les coursiers) → aucune modification de contrainte nécessaire ici.

-- ─── 17. Droits d'exécution ───────────────────────────────────────────────
REVOKE ALL ON FUNCTION public._activate_next_rescue_offer(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rescuer_register(jsonb)                          TO authenticated;
GRANT EXECUTE ON FUNCTION public.rescuer_set_status(text, double precision, double precision) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rescuer_ping(double precision, double precision) TO authenticated;
GRANT EXECUTE ON FUNCTION public.nearby_rescuers(double precision, double precision, integer, integer, text) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.create_rescue_request(jsonb)                     TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_rescue_request(uuid, uuid)                TO authenticated;
GRANT EXECUTE ON FUNCTION public.decline_rescue_request(uuid, uuid)               TO authenticated;
GRANT EXECUTE ON FUNCTION public.rescue_dispatch_tick(uuid)                       TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.admin_assign_rescue(uuid, uuid)                  TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_rescue_progress(uuid, text)                  TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_rescue_request(uuid)                    TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_rescue_request(uuid)                      TO authenticated;
GRANT EXECUTE ON FUNCTION public.rate_rescuer(uuid, smallint)                     TO authenticated;
GRANT EXECUTE ON FUNCTION public.rescue_dispatch_tick_all()                       TO authenticated, anon, service_role;

-- ════════════════════════════════════════════════════════════════════════════
--  FIN — NEXUS Dépannage Auto. Le front consomme : rescuer_register,
--  nearby_rescuers, create_rescue_request, accept/decline_rescue_request,
--  set_rescue_progress, complete_rescue_request, rate_rescuer.
--  Différé (hors périmètre de cette migration) : classement OSRM/VROOM
--  (comme /api/courier/optimize), notifications WhatsApp, panneau admin dédié
--  (admin_assign_rescue existe déjà côté SQL, prêt pour une UI future).
-- ════════════════════════════════════════════════════════════════════════════
