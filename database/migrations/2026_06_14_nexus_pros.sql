-- ════════════════════════════════════════════════════════════════════════════
--  NEXUS Market — Vertical « NEXUS Pro » 🔧  (ouvriers / artisans géolocalisés)
--
--  But : un professionnel (maçon, plombier, électricien…) s'inscrit, dépose ses
--  coordonnées + sa position, et un visiteur en recherche trouve les pros LES
--  PLUS PROCHES de lui (matching de proximité temps réel).
--
--  Réutilise INTÉGRALEMENT le socle géospatial déjà déployé pour le coursier :
--    · `profiles.geolocation` (PostGIS, GEOGRAPHY(POINT,4326)) maintenu par le
--      trigger `sync_profile_geolocation` à partir de current_lat/current_lng.
--    · même approche que `is_breeder` / `nearby_breeders`.
--
--  Idempotent / rejouable : ADD COLUMN IF NOT EXISTS, CREATE INDEX IF NOT EXISTS,
--  CREATE OR REPLACE FUNCTION. Ne supprime ni ne renomme aucune colonne.
--  À exécuter dans Supabase → SQL Editor.
-- ════════════════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS postgis WITH SCHEMA extensions;
SET search_path = public, extensions;

-- ─── 1. Flag « professionnel » sur le profil + index spatial dédié ───────────
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_pro boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_profiles_pro_geo
  ON public.profiles USING GIST (geolocation) WHERE is_pro = true;

-- ─── 2. Fiche métier du professionnel (1 ligne / utilisateur) ────────────────
--     Clé applicative = user_id = profiles.id = auth.uid() (comme `couriers`).
CREATE TABLE IF NOT EXISTS public.pros (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name             text,
  profession       text NOT NULL,
  description      text,
  experience_years integer,
  tarif_text       text,          -- libellé libre : « à partir de 5 000 FCFA », « sur devis »…
  photo_url        text,
  phone            text,
  city             text,
  disponible       boolean NOT NULL DEFAULT true,
  rating_avg       numeric(3,2) NOT NULL DEFAULT 0,
  rating_count     integer NOT NULL DEFAULT 0,
  status           text NOT NULL DEFAULT 'active',  -- active | hidden | banned
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_pros_user_id ON public.pros(user_id);
CREATE INDEX IF NOT EXISTS idx_pros_profession    ON public.pros(profession);
CREATE INDEX IF NOT EXISTS idx_pros_status        ON public.pros(status) WHERE status = 'active';

-- ─── 3. RLS : lecture publique des fiches actives, écriture = propriétaire ────
ALTER TABLE public.pros ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pros_select_public ON public.pros;
CREATE POLICY pros_select_public ON public.pros
  FOR SELECT USING (status = 'active');

DROP POLICY IF EXISTS pros_modify_own ON public.pros;
CREATE POLICY pros_modify_own ON public.pros
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ════════════════════════════════════════════════════════════════════════════
--  4. RPC pro_register(payload jsonb)
--     Inscription / mise à jour atomique du pro courant (auth.uid()) :
--       · upsert de sa fiche `pros`
--       · profiles.is_pro = true + position (GPS) → geolocation via trigger
--     SECURITY DEFINER pour fiabiliser l'écriture (indépendant des RLS).
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.pro_register(payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_uid  uuid := auth.uid();
  v_lat  double precision := NULLIF(payload->>'lat','')::double precision;
  v_lng  double precision := NULLIF(payload->>'lng','')::double precision;
  v_row  public.pros%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  END IF;
  IF COALESCE(NULLIF(payload->>'profession',''), '') = '' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'profession_required');
  END IF;

  INSERT INTO public.pros (
    user_id, name, profession, description, experience_years, tarif_text,
    photo_url, phone, city, disponible, status, updated_at
  ) VALUES (
    v_uid,
    NULLIF(payload->>'name',''),
    payload->>'profession',
    NULLIF(payload->>'description',''),
    NULLIF(payload->>'experience_years','')::integer,
    NULLIF(payload->>'tarif_text',''),
    NULLIF(payload->>'photo_url',''),
    NULLIF(payload->>'phone',''),
    NULLIF(payload->>'city',''),
    COALESCE((payload->>'disponible')::boolean, true),
    'active',
    now()
  )
  ON CONFLICT (user_id) DO UPDATE SET
    name             = COALESCE(EXCLUDED.name, public.pros.name),
    profession       = EXCLUDED.profession,
    description      = COALESCE(EXCLUDED.description, public.pros.description),
    experience_years = COALESCE(EXCLUDED.experience_years, public.pros.experience_years),
    tarif_text       = COALESCE(EXCLUDED.tarif_text, public.pros.tarif_text),
    photo_url        = COALESCE(EXCLUDED.photo_url, public.pros.photo_url),
    phone            = COALESCE(EXCLUDED.phone, public.pros.phone),
    city             = COALESCE(EXCLUDED.city, public.pros.city),
    disponible       = EXCLUDED.disponible,
    status           = 'active',
    updated_at       = now()
  RETURNING * INTO v_row;

  -- Profil : flag pro + position live (le trigger remplit geolocation)
  IF v_lat IS NOT NULL AND v_lng IS NOT NULL THEN
    UPDATE public.profiles
       SET is_pro = true, current_lat = v_lat, current_lng = v_lng,
           location_updated_at = now()
     WHERE id = v_uid;
  ELSE
    UPDATE public.profiles SET is_pro = true WHERE id = v_uid;
  END IF;

  RETURN to_jsonb(v_row) || jsonb_build_object('ok', true);
END;
$$;

-- ════════════════════════════════════════════════════════════════════════════
--  5. RPC nearby_pros(lat, lng, radius_m, limit, profession)
--     Cœur du matching : pros actifs & disponibles, triés par distance réelle.
--     `p_profession` NULL/'' = tous métiers ; sinon filtre exact (insensible casse).
-- ════════════════════════════════════════════════════════════════════════════
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
  lat              double precision,
  lng              double precision
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT
    pr.id,
    pr.user_id,
    COALESCE(NULLIF(pr.name, ''), p.name)        AS name,
    pr.profession,
    pr.description,
    pr.experience_years,
    pr.tarif_text,
    pr.photo_url,
    COALESCE(NULLIF(pr.phone, ''), p.phone)       AS phone,
    pr.city,
    pr.rating_avg,
    pr.rating_count,
    ROUND((ST_Distance(
      p.geolocation,
      ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography
    ) / 1000.0)::numeric, 2)                       AS distance_km,
    p.current_lat,
    p.current_lng
  FROM public.pros pr
  JOIN public.profiles p ON p.id = pr.user_id
  WHERE pr.status = 'active'
    AND pr.disponible = true
    AND p.geolocation IS NOT NULL
    AND (p_profession IS NULL OR p_profession = ''
         OR lower(pr.profession) = lower(p_profession))
    AND ST_DWithin(
          p.geolocation,
          ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography,
          GREATEST(p_radius_m, 0)
        )
  ORDER BY p.geolocation <-> ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography
  LIMIT GREATEST(p_limit, 1);
$$;

-- ─── 6. Droits d'exécution ───────────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION public.pro_register(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.nearby_pros(double precision, double precision, integer, integer, text) TO authenticated, anon;

-- ════════════════════════════════════════════════════════════════════════════
--  FIN — vertical NEXUS Pro. Le front consomme nearby_pros / pro_register.
-- ════════════════════════════════════════════════════════════════════════════
