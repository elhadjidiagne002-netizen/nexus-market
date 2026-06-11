-- ════════════════════════════════════════════════════════════════════════════
--  NEXUS Market — Socle géospatial « modèle Yango » pour le coursier à la demande
--  (PostGIS + matching de proximité temps réel — coût 0 €, free tier Supabase)
--
--  Idempotent / rejouable : n'utilise QUE des ADD COLUMN IF NOT EXISTS,
--  CREATE INDEX IF NOT EXISTS et CREATE OR REPLACE FUNCTION.
--  Ne supprime ni ne renomme aucune colonne existante.
--
--  Modèle de données réel (vérifié sur le backup 2026-06-09) :
--    · La POSITION LIVE du coursier est stockée sur `profiles`
--      (current_lat / current_lng / location_updated_at / courier_status),
--      keyée par profiles.id = couriers.user_id = auth.uid().
--    · `couriers` = fiche métier (id, user_id, is_available, status, phone…).
--    · `deliveries.courier_id`  et  `delivery_offers.courier_id`  référencent
--      **couriers.id** (cf. AdminLivraisonPanel : couriers.find(c => c.id === d.courier_id)).
--    · `delivery_zones` = centroïdes de quartiers (fallback hors-GPS).
--
--  À exécuter dans Supabase → SQL Editor.
-- ════════════════════════════════════════════════════════════════════════════

-- ─── 0. Extension PostGIS (disponible sur le free tier Supabase) ─────────────
--     Sur Supabase, PostGIS vit dans le schéma `extensions`. On l'inclut donc
--     dans le search_path (session + chaque fonction) pour résoudre les ST_*.
CREATE EXTENSION IF NOT EXISTS postgis WITH SCHEMA extensions;
SET search_path = public, extensions;

-- ─── 0bis. Nettoyage d'éventuelles versions antérieures de ces RPC ────────────
--     Des versions existent peut-être déjà en prod avec un type de retour
--     différent : CREATE OR REPLACE ne peut PAS changer le type de retour
--     (ERROR 42P13). On les supprime d'abord (signatures exactes recréées plus bas).
DROP FUNCTION IF EXISTS public.courier_ping(double precision, double precision);
DROP FUNCTION IF EXISTS public.nearby_couriers(double precision, double precision, integer, integer);
DROP FUNCTION IF EXISTS public.create_delivery(jsonb);
DROP FUNCTION IF EXISTS public.accept_delivery(uuid, uuid);

-- ─── 1. Colonne géographique sur profiles (position live du coursier) ────────
--     GEOGRAPHY(POINT,4326) = WGS84 ; permet ST_DWithin / ST_Distance en mètres.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS geolocation geography(Point, 4326);

-- Index spatial GIST : recherche par bounding-box avant calcul de distance réelle.
CREATE INDEX IF NOT EXISTS idx_profiles_geolocation
  ON public.profiles USING GIST (geolocation);

-- Index partiel pour ne scanner que les coursiers en ligne (matching ultra-rapide).
CREATE INDEX IF NOT EXISTS idx_profiles_courier_geo
  ON public.profiles USING GIST (geolocation)
  WHERE is_courier = true;

-- ─── 2. Synchronisation auto current_lat/current_lng → geolocation ───────────
--     Le front (et courier_ping) écrivent current_lat/current_lng ; ce trigger
--     maintient `geolocation` sans rien changer au reste du code.
CREATE OR REPLACE FUNCTION public.sync_profile_geolocation()
RETURNS trigger LANGUAGE plpgsql
SET search_path = public, extensions
AS $$
BEGIN
  IF NEW.current_lat IS NOT NULL AND NEW.current_lng IS NOT NULL THEN
    NEW.geolocation := ST_SetSRID(ST_MakePoint(NEW.current_lng, NEW.current_lat), 4326)::geography;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_profile_geolocation ON public.profiles;
CREATE TRIGGER trg_sync_profile_geolocation
  BEFORE INSERT OR UPDATE OF current_lat, current_lng ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.sync_profile_geolocation();

-- Backfill des lignes déjà positionnées (no-op si aucune).
UPDATE public.profiles
   SET geolocation = ST_SetSRID(ST_MakePoint(current_lng, current_lat), 4326)::geography
 WHERE current_lat IS NOT NULL AND current_lng IS NOT NULL
   AND geolocation IS NULL;

-- ════════════════════════════════════════════════════════════════════════════
--  3. RPC courier_ping(lat, lng)
--     Appelé en continu par le navigateur du coursier (watchPosition, ~1/8 s).
--     · Met à jour sa position sur profiles (→ geolocation via trigger).
--     · Propage la position sur ses courses actives (deliveries.courier_lat/lng)
--       pour le suivi live de l'acheteur (Realtime).
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.courier_ping(p_lat double precision, p_lng double precision)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_courier_id uuid;
BEGIN
  IF v_uid IS NULL OR p_lat IS NULL OR p_lng IS NULL THEN
    RETURN;
  END IF;

  -- 1) position personnelle (le trigger remplit geolocation)
  UPDATE public.profiles
     SET current_lat = p_lat,
         current_lng = p_lng,
         location_updated_at = now()
   WHERE id = v_uid;

  -- 2) fiche coursier liée (si elle existe)
  SELECT id INTO v_courier_id FROM public.couriers WHERE user_id = v_uid LIMIT 1;

  -- 3) propager sur les courses en cours pour le suivi acheteur
  IF v_courier_id IS NOT NULL THEN
    UPDATE public.deliveries
       SET courier_lat = p_lat,
           courier_lng = p_lng
     WHERE courier_id = v_courier_id
       AND status IN ('accepted', 'picked_up', 'in_transit');
  END IF;
END;
$$;

-- ════════════════════════════════════════════════════════════════════════════
--  4. RPC nearby_couriers(lat, lng, radius_m, limit)
--     Cœur du matching « Yango » : coursiers EN LIGNE & DISPONIBLES, triés par
--     distance réelle au point de retrait. Utilise l'index GIST (ST_DWithin).
--     Retourne couriers.id (= identifiant utilisé par deliveries/offers).
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.nearby_couriers(
  p_lat       double precision,
  p_lng       double precision,
  p_radius_m  integer DEFAULT 7000,
  p_limit     integer DEFAULT 15
)
RETURNS TABLE (
  courier_id  uuid,
  user_id     uuid,
  name        text,
  phone       text,
  vehicle_type text,
  distance_km numeric,
  rating_avg  numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT
    c.id,
    c.user_id,
    c.name,
    c.phone,
    c.vehicle_type,
    ROUND((ST_Distance(
      p.geolocation,
      ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography
    ) / 1000.0)::numeric, 2) AS distance_km,
    c.rating_avg
  FROM public.couriers c
  JOIN public.profiles p ON p.id = c.user_id
  WHERE c.is_available = true
    AND c.status = 'active'
    AND p.geolocation IS NOT NULL
    -- position fraîche (< 15 min) pour ne pas proposer un coursier « fantôme »
    AND (p.location_updated_at IS NULL OR p.location_updated_at > now() - interval '15 minutes')
    AND ST_DWithin(
          p.geolocation,
          ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography,
          GREATEST(p_radius_m, 0)
        )
  ORDER BY p.geolocation <-> ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography
  LIMIT GREATEST(p_limit, 1);
$$;

-- ════════════════════════════════════════════════════════════════════════════
--  5. RPC create_delivery(payload jsonb)
--     · Insère la course (deliveries, status 'searching').
--     · Cherche les coursiers proches du RETRAIT et leur crée une offre
--       (delivery_offers, status 'pending', expiration ~40 s).
--     · Renvoie la course + `notified_couriers` (phone/nom/distance) que le
--       module WhatsApp front utilise pour le « 1er qui accepte remporte ».
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
  v_notified jsonb := '[]'::jsonb;
  v_row deliveries%ROWTYPE;
BEGIN
  INSERT INTO public.deliveries (
    buyer_id, order_id, type, status,
    pickup_zone, pickup_label, pickup_lat, pickup_lng,
    dropoff_zone, dropoff_label, dropoff_lat, dropoff_lng,
    items_desc, distance_km, fee_fcfa, courier_payout, commission_fcfa,
    payment_method
  ) VALUES (
    NULLIF(payload->>'buyer_id','')::uuid,
    NULLIF(payload->>'order_id','')::uuid,
    COALESCE(NULLIF(payload->>'type',''), 'errand'),
    'searching',
    payload->>'pickup_zone',
    payload->>'pickup_label',
    v_plat,
    v_plng,
    payload->>'dropoff_zone',
    payload->>'dropoff_label',
    NULLIF(payload->>'dropoff_lat','')::double precision,
    NULLIF(payload->>'dropoff_lng','')::double precision,
    payload->>'items_desc',
    NULLIF(payload->>'distance_km','')::numeric,
    COALESCE(NULLIF(payload->>'fee_fcfa','')::integer, 0),
    COALESCE(NULLIF(payload->>'courier_payout','')::integer, 0),
    COALESCE(NULLIF(payload->>'commission_fcfa','')::integer, 0),
    payload->>'payment_method'
  )
  RETURNING id INTO v_id;

  -- Offres aux coursiers proches du point de retrait (si GPS fourni).
  -- `ins` (CTE modifiant les données) s'exécute toujours intégralement ;
  -- `near` n'est calculé qu'une fois et sert à l'insert ET au récap notifié.
  IF v_plat IS NOT NULL AND v_plng IS NOT NULL THEN
    WITH near AS (
      SELECT * FROM public.nearby_couriers(v_plat, v_plng, 7000, 12)
    ), ins AS (
      INSERT INTO public.delivery_offers (delivery_id, courier_id, distance_km, status)
      SELECT v_id, near.courier_id, near.distance_km, 'pending' FROM near
      RETURNING courier_id
    )
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'courier_id',  near.courier_id,
             'user_id',     near.user_id,
             'name',        near.name,
             'phone',       near.phone,
             'distance_km', near.distance_km
           )), '[]'::jsonb)
      INTO v_notified
      FROM near;
  END IF;

  SELECT * INTO v_row FROM public.deliveries WHERE id = v_id;

  RETURN to_jsonb(v_row) || jsonb_build_object('notified_couriers', v_notified);
END;
$$;

-- ════════════════════════════════════════════════════════════════════════════
--  6. RPC accept_delivery(delivery_id, courier_id)
--     Attribution ATOMIQUE « 1er arrivé » : un seul coursier remporte la course.
--     p_courier_id = couriers.id. Si déjà prise → { ok:false, reason:'already_taken' }.
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.accept_delivery(p_delivery_id uuid, p_courier_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_claimed uuid;
  v_user uuid;
BEGIN
  -- Claim atomique : ne réussit que si la course est encore libre.
  UPDATE public.deliveries
     SET courier_id = p_courier_id,
         status = 'accepted',
         assigned_at = now()
   WHERE id = p_delivery_id
     AND courier_id IS NULL
     AND status IN ('searching', 'pending')
  RETURNING id INTO v_claimed;

  IF v_claimed IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_taken');
  END IF;

  -- Offre gagnante / perdantes
  UPDATE public.delivery_offers
     SET status = 'accepted', responded_at = now()
   WHERE delivery_id = p_delivery_id AND courier_id = p_courier_id;
  UPDATE public.delivery_offers
     SET status = 'expired', responded_at = now()
   WHERE delivery_id = p_delivery_id AND courier_id <> p_courier_id
     AND status = 'pending';

  -- Marquer le coursier occupé
  UPDATE public.couriers SET is_available = false WHERE id = p_courier_id;
  SELECT user_id INTO v_user FROM public.couriers WHERE id = p_courier_id;
  IF v_user IS NOT NULL THEN
    UPDATE public.profiles SET courier_status = 'busy' WHERE id = v_user;
  END IF;

  RETURN jsonb_build_object('ok', true, 'delivery_id', p_delivery_id);
END;
$$;

-- ─── 7. Droits d'exécution ───────────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION public.courier_ping(double precision, double precision) TO authenticated;
GRANT EXECUTE ON FUNCTION public.nearby_couriers(double precision, double precision, integer, integer) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.create_delivery(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_delivery(uuid, uuid) TO authenticated;

-- ─── 8. (Optionnel) Realtime sur deliveries pour le suivi live acheteur ──────
--     À activer une seule fois si pas déjà fait (Database → Replication) :
--     ALTER PUBLICATION supabase_realtime ADD TABLE public.deliveries;

-- ════════════════════════════════════════════════════════════════════════════
--  FIN — socle géospatial coursier. Le front (NexusMap + modules coursier)
--  consomme nearby_couriers / create_delivery / accept_delivery / courier_ping.
-- ════════════════════════════════════════════════════════════════════════════
