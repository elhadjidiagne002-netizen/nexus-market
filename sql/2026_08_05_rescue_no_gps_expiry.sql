-- ════════════════════════════════════════════════════════════════════════════
--  NEXUS Dépannage Auto — Supprimer la péremption GPS de nearby_rescuers.
--
--  Problème observé (SOS 2026-08-05 fecba5de resté "no_rescuer" alors qu'un
--  dépanneur "shams garage" était bien available/active) : nearby_rescuers
--  exigeait location_updated_at > now() - 15 min. Le seul dépanneur en ligne
--  avait une position figée depuis 32 min → exclu → cascade sans offre.
--
--  Décision (demande utilisateur) : PAS de date de péremption pour le dépanneur.
--  On prend TOUJOURS sa dernière position connue, peu importe son ancienneté.
--  Justification : contrairement au coursier (flotte en mouvement constant), le
--  dépanneur est souvent STATIONNAIRE (garage) et peu nombreux. La disponibilité
--  est pilotée EXPLICITEMENT par le dépanneur (bouton En ligne / Hors ligne →
--  is_available + rescuer_status) et par la prise de course (busy) : c'est CE
--  signal qui fait foi, pas la fraîcheur GPS. Un faux positif (dépanneur parti
--  sans se déconnecter) est rattrapé par l'expiration d'offre (3 min → suivant).
--
--  La condition location_updated_at est donc entièrement retirée ; on garde
--  is_available=true, status='active', geolocation NON NULL et le rayon.
--
--  Idempotent (CREATE OR REPLACE).
-- ════════════════════════════════════════════════════════════════════════════
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
    -- Pas de péremption GPS : dernière position connue quelle que soit son ancienneté.
    AND (p_specialty IS NULL OR p_specialty = '' OR p_specialty = ANY(r.specialties))
    AND ST_DWithin(p.geolocation, ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography, GREATEST(p_radius_m, 0))
  ORDER BY p.geolocation <-> ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography
  LIMIT GREATEST(p_limit, 1);
$$;
