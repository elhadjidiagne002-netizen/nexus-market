-- ════════════════════════════════════════════════════════════════════════════
--  NEXUS Market — NEXUS Pro : TOUJOURS proposer un pro
--
--  DEMANDE (2026-06-16) : le chercheur de professionnel doit TOUJOURS voir au
--  moins un pro, même s'il n'est pas en ligne (disponible=false), sans position
--  GPS, ou hors du rayon. L'ancien nearby_pros filtrait durement sur
--  disponible + geolocation + ST_DWithin → écran vide fréquent.
--
--  NOUVEAU : on ne filtre QUE sur status='active' (+ métier si fourni). Tous les
--  pros actifs sont renvoyés, classés « meilleur match d'abord » :
--    1) disponibles avant indisponibles
--    2) dans le rayon avant hors rayon
--    3) plus proches d'abord (distance NULL = sans GPS, en dernier)
--    4) mieux notés / plus récents
--  distance_km vaut NULL si le pro n'a pas de position. Ajoute le flag `disponible`
--  et `in_radius` pour l'affichage. Idempotent.
-- ════════════════════════════════════════════════════════════════════════════

SET search_path = public, extensions;

DROP FUNCTION IF EXISTS public.nearby_pros(double precision, double precision, integer, integer, text);
CREATE OR REPLACE FUNCTION public.nearby_pros(
  p_lat        double precision,
  p_lng        double precision,
  p_radius_m   integer DEFAULT 30000,
  p_limit      integer DEFAULT 40,
  p_profession text    DEFAULT NULL
)
RETURNS TABLE (
  pro_id           uuid,
  user_id          uuid,
  name             text,
  profession       text,
  description      text,
  experience_years integer,
  tarif_text       text,
  photo_url        text,
  phone            text,
  city             text,
  rating_avg       numeric,
  rating_count     integer,
  distance_km      numeric,
  disponible       boolean,
  in_radius        boolean,
  lat              double precision,
  lng              double precision
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  WITH base AS (
    SELECT
      pr.id, pr.user_id,
      COALESCE(NULLIF(pr.name, ''), p.name)   AS name,
      pr.profession, pr.description, pr.experience_years, pr.tarif_text, pr.photo_url,
      COALESCE(NULLIF(pr.phone, ''), p.phone)  AS phone,
      pr.city, pr.rating_avg, pr.rating_count, pr.disponible,
      p.current_lat, p.current_lng,
      CASE WHEN p.geolocation IS NOT NULL AND p_lat IS NOT NULL AND p_lng IS NOT NULL
           THEN ROUND((ST_Distance(p.geolocation,
                  ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography) / 1000.0)::numeric, 2)
           ELSE NULL END AS distance_km
    FROM public.pros pr
    JOIN public.profiles p ON p.id = pr.user_id
    WHERE pr.status = 'active'
      AND (p_profession IS NULL OR p_profession = '' OR lower(pr.profession) = lower(p_profession))
  )
  SELECT
    id, user_id, name, profession, description, experience_years, tarif_text,
    photo_url, phone, city, rating_avg, rating_count, distance_km, disponible,
    (distance_km IS NOT NULL AND distance_km * 1000 <= GREATEST(p_radius_m, 0)) AS in_radius,
    current_lat AS lat, current_lng AS lng
  FROM base
  ORDER BY
    disponible DESC,
    (distance_km IS NOT NULL AND distance_km * 1000 <= GREATEST(p_radius_m, 0)) DESC,
    distance_km ASC NULLS LAST,
    rating_avg DESC, rating_count DESC
  LIMIT GREATEST(p_limit, 1);
$$;

GRANT EXECUTE ON FUNCTION public.nearby_pros(double precision, double precision, integer, integer, text)
  TO authenticated, anon;
