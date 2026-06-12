-- ════════════════════════════════════════════════════════════════════════════
--  NEXUS Market — COMPTEUR PUBLIC DE LIVREURS EN LIGNE
--
--  DEMANDE (2026-06-12) : celui qui commande doit voir, au moment de lancer sa
--  commande, le NOMBRE de livreurs en ligne.
--
--  RPC online_couriers_count(p_lat, p_lng, p_radius_m) → integer
--   · Sans coordonnées : nombre TOTAL de livreurs actuellement éligibles au
--     dispatch (mêmes critères que nearby_couriers : approuvé + disponible +
--     position fraîche < 15 min).
--   · Avec coordonnées : nombre dans le rayon donné (défaut 12 km, le rayon
--     utilisé par la cascade de dispatch).
--
--  Sécurité : SECURITY DEFINER, ne renvoie qu'un NOMBRE (aucune position ni
--  identité — contrairement à online_couriers_geo qui reste réservé admin).
--  Accessible aux visiteurs (anon) : la demande de course est ouverte à tous.
--
--  Idempotent. À exécuter dans Supabase → SQL Editor.
-- ════════════════════════════════════════════════════════════════════════════

SET search_path = public, extensions;

CREATE OR REPLACE FUNCTION public.online_couriers_count(
  p_lat      double precision DEFAULT NULL,
  p_lng      double precision DEFAULT NULL,
  p_radius_m integer          DEFAULT 12000
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
           GREATEST(COALESCE(p_radius_m, 12000), 0)
         )
    );
$$;

GRANT EXECUTE ON FUNCTION public.online_couriers_count(double precision, double precision, integer)
  TO anon, authenticated;
