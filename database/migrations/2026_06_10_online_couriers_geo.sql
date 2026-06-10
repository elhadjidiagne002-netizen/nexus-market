-- ════════════════════════════════════════════════════════════════════════════
--  NEXUS Market — Géolocalisation des livreurs EN LIGNE (vue admin)
--  RPC online_couriers_geo() : renvoie les coursiers disponibles avec leur
--  position live (profiles.current_lat/lng), réservé aux ADMINS.
--  Idempotent. À exécuter dans Supabase → SQL Editor.
-- ════════════════════════════════════════════════════════════════════════════

SET search_path = public;

CREATE OR REPLACE FUNCTION public.online_couriers_geo()
RETURNS TABLE (
  courier_id          uuid,
  user_id             uuid,
  name                text,
  phone               text,
  vehicle_type        text,
  is_available        boolean,
  status              text,
  courier_status      text,
  lat                 double precision,
  lng                 double precision,
  location_updated_at timestamptz,
  deliveries_done     integer,
  rating_avg          numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    c.id, c.user_id, c.name, c.phone, c.vehicle_type, c.is_available, c.status,
    p.courier_status, p.current_lat, p.current_lng, p.location_updated_at,
    c.deliveries_done, c.rating_avg
  FROM public.couriers c
  JOIN public.profiles p ON p.id = c.user_id
  WHERE
    -- Réservé aux administrateurs (l'appelant doit être admin).
    EXISTS (SELECT 1 FROM public.profiles me WHERE me.id = auth.uid() AND me.role = 'admin')
    AND c.status = 'active'
    AND c.is_available = true
    AND p.current_lat IS NOT NULL AND p.current_lng IS NOT NULL
    AND (p.location_updated_at IS NULL OR p.location_updated_at > now() - interval '20 minutes')
  ORDER BY p.location_updated_at DESC NULLS LAST;
$$;

GRANT EXECUTE ON FUNCTION public.online_couriers_geo() TO authenticated;
