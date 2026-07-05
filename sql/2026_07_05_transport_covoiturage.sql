-- ════════════════════════════════════════════════════════════════════════════
--  COVOITURAGE + TRANSPORTEURS + COLIS SUR TRAJET
--  Nouvelle brique, distincte du module coursier existant (couriers/
--  delivery_requests = livraison à la demande, point à point, intra-agglo).
--  Ici : trajets PROGRAMMÉS à l'avance (inter-villes), places de covoiturage
--  (particuliers ou transporteurs pro) + envoi de colis rattaché à un trajet.
--
--  Convention monétaire : prix en FCFA (int), cohérent avec couriers/
--  delivery_requests (fee_fcfa) — PAS en EUR comme orders/products.
--
--  RLS mirrorée sur les policies réelles de `couriers` (vérifiées en prod
--  via pg_policies) : is_admin() (bare, search_path), auth.uid() = user_id
--  pour le propriétaire, lecture publique restreinte par statut.
--
--  À exécuter dans Supabase → SQL Editor (ou via l'API Management).
-- ════════════════════════════════════════════════════════════════════════════

-- ─── 1. transporters — rôle pro distinct des coursiers ───────────────────────
CREATE TABLE IF NOT EXISTS public.transporters (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid UNIQUE REFERENCES public.profiles(id),
  name            text NOT NULL,
  phone           text NOT NULL,
  company_name    text,
  vehicle_type    text NOT NULL DEFAULT 'voiture' CHECK (vehicle_type IN ('voiture','van','minibus','bus')),
  vehicle_model   text,
  vehicle_plate   text,
  seats_capacity  integer NOT NULL DEFAULT 4 CHECK (seats_capacity > 0),
  status          text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','suspended')),
  rating_avg      numeric NOT NULL DEFAULT 5.0,
  rating_count    integer NOT NULL DEFAULT 0,
  trips_done      integer NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- ─── 2. transport_trips — trajets programmés (particulier ou transporteur) ──
CREATE TABLE IF NOT EXISTS public.transport_trips (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id               uuid NOT NULL REFERENCES public.profiles(id),
  driver_type             text NOT NULL DEFAULT 'particulier' CHECK (driver_type IN ('particulier','transporteur')),
  transporter_id          uuid REFERENCES public.transporters(id),
  origin_city             text NOT NULL,
  origin_address          text,
  destination_city        text NOT NULL,
  destination_address     text,
  departure_at            timestamptz NOT NULL,
  vehicle_type            text NOT NULL DEFAULT 'voiture',
  seats_total             integer NOT NULL CHECK (seats_total > 0),
  seats_available         integer NOT NULL,
  price_per_seat_fcfa     integer NOT NULL CHECK (price_per_seat_fcfa >= 0),
  allows_packages         boolean NOT NULL DEFAULT true,
  price_per_package_fcfa  integer,
  status                  text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','in_progress','completed','cancelled')),
  notes                   text,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT seats_available_range CHECK (seats_available >= 0 AND seats_available <= seats_total)
);

CREATE INDEX IF NOT EXISTS idx_transport_trips_search
  ON public.transport_trips (origin_city, destination_city, departure_at)
  WHERE status = 'scheduled';
CREATE INDEX IF NOT EXISTS idx_transport_trips_driver ON public.transport_trips (driver_id);

-- ─── 3. transport_reservations — places ET colis (booking_type) ─────────────
CREATE TABLE IF NOT EXISTS public.transport_reservations (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id               uuid NOT NULL REFERENCES public.transport_trips(id),
  booking_type          text NOT NULL CHECK (booking_type IN ('seat','package')),
  requester_id          uuid NOT NULL REFERENCES public.profiles(id),
  requester_name        text,
  requester_phone       text,
  seats_booked          integer CHECK (seats_booked IS NULL OR seats_booked > 0),
  recipient_name        text,
  recipient_phone       text,
  package_description   text,
  price_fcfa            integer NOT NULL DEFAULT 0 CHECK (price_fcfa >= 0),
  status                text NOT NULL DEFAULT 'pending_payment'
                          CHECK (status IN ('pending_payment','pending_review','confirmed','rejected','cancelled','completed')),
  payment_status        text NOT NULL DEFAULT 'pending' CHECK (payment_status IN ('pending','paid','failed','refunded')),
  payment_method        text CHECK (payment_method IS NULL OR payment_method IN ('paytech','admin_comp')),
  payment_ref           text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_transport_resa_trip ON public.transport_reservations (trip_id);
CREATE INDEX IF NOT EXISTS idx_transport_resa_requester ON public.transport_reservations (requester_id);

-- ─── 4. RPC book_transport_seats — réservation atomique (anti-surréservation) ─
DROP FUNCTION IF EXISTS public.book_transport_seats(uuid, integer, text, text);
CREATE OR REPLACE FUNCTION public.book_transport_seats(
  p_trip_id uuid,
  p_seats   integer,
  p_name    text,
  p_phone   text
)
RETURNS public.transport_reservations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_price integer;
  v_resa  public.transport_reservations;
BEGIN
  IF p_seats IS NULL OR p_seats <= 0 THEN
    RAISE EXCEPTION 'Nombre de places invalide';
  END IF;

  -- Décrément atomique : ne réussit que s'il reste assez de places ET que le
  -- trajet est toujours programmé. 0 ligne affectée => surréservation évitée.
  UPDATE public.transport_trips
     SET seats_available = seats_available - p_seats,
         updated_at = now()
   WHERE id = p_trip_id
     AND status = 'scheduled'
     AND seats_available >= p_seats
  RETURNING price_per_seat_fcfa INTO v_price;

  IF v_price IS NULL THEN
    RAISE EXCEPTION 'Places insuffisantes ou trajet indisponible';
  END IF;

  INSERT INTO public.transport_reservations (
    trip_id, booking_type, requester_id, requester_name, requester_phone,
    seats_booked, price_fcfa, status, payment_status
  ) VALUES (
    p_trip_id, 'seat', auth.uid(), p_name, p_phone,
    p_seats, v_price * p_seats, 'pending_payment', 'pending'
  )
  RETURNING * INTO v_resa;

  RETURN v_resa;
END;
$$;

-- ─── 5. RPC release_expired_transport_holds — libère les places non payées ──
-- Réservations 'seat'/'pending_payment' de plus de 30 min : on considère le
-- paiement abandonné et on restitue les places (pattern fail-open léger,
-- cohérent avec la purge des rate limits >24h ailleurs dans le projet).
DROP FUNCTION IF EXISTS public.release_expired_transport_holds();
CREATE OR REPLACE FUNCTION public.release_expired_transport_holds()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer := 0;
  v_row   record;
BEGIN
  FOR v_row IN
    SELECT id, trip_id, seats_booked
      FROM public.transport_reservations
     WHERE booking_type = 'seat'
       AND status = 'pending_payment'
       AND payment_status = 'pending'
       AND created_at < now() - interval '30 minutes'
  LOOP
    UPDATE public.transport_trips
       SET seats_available = LEAST(seats_total, seats_available + COALESCE(v_row.seats_booked, 0)),
           updated_at = now()
     WHERE id = v_row.trip_id;

    UPDATE public.transport_reservations
       SET status = 'cancelled', payment_status = 'failed', updated_at = now()
     WHERE id = v_row.id;

    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;

-- ─── 6. RLS ───────────────────────────────────────────────────────────────
ALTER TABLE public.transporters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transport_trips ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transport_reservations ENABLE ROW LEVEL SECURITY;

-- transporters : propriétaire + admin (mirror couriers_self_*/couriers_admin_all)
DROP POLICY IF EXISTS transporters_self_read ON public.transporters;
CREATE POLICY transporters_self_read ON public.transporters
  FOR SELECT USING (user_id = auth.uid());
DROP POLICY IF EXISTS transporters_self_insert ON public.transporters;
CREATE POLICY transporters_self_insert ON public.transporters
  FOR INSERT WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS transporters_self_update ON public.transporters;
CREATE POLICY transporters_self_update ON public.transporters
  FOR UPDATE USING (user_id = auth.uid());
DROP POLICY IF EXISTS transporters_admin_all ON public.transporters;
CREATE POLICY transporters_admin_all ON public.transporters
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- transport_trips : lecture publique des trajets programmés, propriétaire, admin
DROP POLICY IF EXISTS trips_public_read ON public.transport_trips;
CREATE POLICY trips_public_read ON public.transport_trips
  FOR SELECT USING (status = 'scheduled');
DROP POLICY IF EXISTS trips_own_all ON public.transport_trips;
CREATE POLICY trips_own_all ON public.transport_trips
  FOR ALL USING (driver_id = auth.uid()) WITH CHECK (driver_id = auth.uid());
DROP POLICY IF EXISTS trips_admin_all ON public.transport_trips;
CREATE POLICY trips_admin_all ON public.transport_trips
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- transport_reservations : demandeur (passager/expéditeur), conducteur du trajet, admin
DROP POLICY IF EXISTS resa_requester_own ON public.transport_reservations;
CREATE POLICY resa_requester_own ON public.transport_reservations
  FOR ALL USING (requester_id = auth.uid()) WITH CHECK (requester_id = auth.uid());
DROP POLICY IF EXISTS resa_driver_own ON public.transport_reservations;
CREATE POLICY resa_driver_own ON public.transport_reservations
  FOR ALL USING (
    trip_id IN (SELECT id FROM public.transport_trips WHERE driver_id = auth.uid())
  ) WITH CHECK (
    trip_id IN (SELECT id FROM public.transport_trips WHERE driver_id = auth.uid())
  );
DROP POLICY IF EXISTS resa_admin_all ON public.transport_reservations;
CREATE POLICY resa_admin_all ON public.transport_reservations
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());
