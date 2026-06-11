-- ════════════════════════════════════════════════════════════════════════════
--  NEXUS Market — Géolocalisation des livreurs (vue admin)
--  RPC online_couriers_geo() : renvoie TOUS les coursiers actifs ayant une
--  dernière position connue, avec un drapeau `is_online` (disponible + position
--  fraîche < 20 min). Réservé aux ADMINS. Idempotent.
--  À exécuter dans Supabase → SQL Editor.
-- ════════════════════════════════════════════════════════════════════════════

SET search_path = public;

-- Le type de retour évolue (colonne is_online) → suppression préalable.
DROP FUNCTION IF EXISTS public.online_couriers_geo();

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
  is_online           boolean,
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
    p.courier_status,
    (c.is_available = true
       AND c.status = 'active'
       AND p.location_updated_at IS NOT NULL
       AND p.location_updated_at > now() - interval '20 minutes') AS is_online,
    p.current_lat, p.current_lng, p.location_updated_at,
    c.deliveries_done, c.rating_avg
  FROM public.couriers c
  JOIN public.profiles p ON p.id = c.user_id
  WHERE
    -- Réservé aux administrateurs.
    EXISTS (SELECT 1 FROM public.profiles me WHERE me.id = auth.uid() AND me.role = 'admin')
    AND c.status = 'active'
    AND p.current_lat IS NOT NULL AND p.current_lng IS NOT NULL
  ORDER BY is_online DESC, p.location_updated_at DESC NULLS LAST;
$$;

GRANT EXECUTE ON FUNCTION public.online_couriers_geo() TO authenticated;
