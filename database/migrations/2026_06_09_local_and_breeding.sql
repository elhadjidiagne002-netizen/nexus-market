-- ════════════════════════════════════════════════════════════════════════════
--  NEXUS Market — Label « Produit Local Sénégal » 🇸🇳 + Espace « NEXUS Élevage » 🐏
--  Idempotent / rejouable. À exécuter dans Supabase → SQL Editor.
--
--  · products.is_local / local_region  → label fierté locale (auto-déclaré vendeur).
--  · products.is_animal / animal_specs → vertical élevage (type/race/poids/âge/sexe).
--  · profiles.is_breeder               → badge « éleveur » + visibilité sur carte.
--  · RPC nearby_breeders               → « éleveurs près de moi » (réutilise
--    profiles.geolocation du socle coursier PostGIS déjà déployé).
-- ════════════════════════════════════════════════════════════════════════════

-- ─── Produits : label local + flag animal/élevage ────────────────────────────
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS is_local     boolean NOT NULL DEFAULT false;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS local_region text;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS is_animal    boolean NOT NULL DEFAULT false;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS animal_specs jsonb;   -- {type,race,poids_kg,age,sexe}

CREATE INDEX IF NOT EXISTS idx_products_is_local  ON public.products(is_local)  WHERE is_local  = true;
CREATE INDEX IF NOT EXISTS idx_products_is_animal ON public.products(is_animal) WHERE is_animal = true;

-- ─── Profil : statut éleveur ─────────────────────────────────────────────────
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_breeder boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_profiles_breeder_geo
  ON public.profiles USING GIST (geolocation) WHERE is_breeder = true;

-- ─── RPC : éleveurs proches (PostGIS, réutilise profiles.geolocation) ─────────
DROP FUNCTION IF EXISTS public.nearby_breeders(double precision, double precision, integer, integer);
CREATE OR REPLACE FUNCTION public.nearby_breeders(
  p_lat      double precision,
  p_lng      double precision,
  p_radius_m integer DEFAULT 30000,
  p_limit    integer DEFAULT 30
)
RETURNS TABLE (
  user_id     uuid,
  shop_name   text,
  phone       text,
  distance_km numeric,
  lat         double precision,
  lng         double precision
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT
    p.id,
    COALESCE(NULLIF(p.shop_name, ''), p.name) AS shop_name,
    p.phone,
    ROUND((ST_Distance(
      p.geolocation,
      ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography
    ) / 1000.0)::numeric, 2) AS distance_km,
    p.current_lat,
    p.current_lng
  FROM public.profiles p
  WHERE p.is_breeder = true
    AND p.geolocation IS NOT NULL
    AND ST_DWithin(
          p.geolocation,
          ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography,
          GREATEST(p_radius_m, 0)
        )
  ORDER BY p.geolocation <-> ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography
  LIMIT GREATEST(p_limit, 1);
$$;

GRANT EXECUTE ON FUNCTION public.nearby_breeders(double precision, double precision, integer, integer) TO authenticated, anon;
