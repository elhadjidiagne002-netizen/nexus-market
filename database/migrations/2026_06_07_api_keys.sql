-- 2026_06_07_api_keys.sql
-- Table `api_keys` + RPC `api_key_validate` requis par functions/api/products-feed.js
-- (flux Google Merchant / NEXUS Pro). Sans ces objets, l'endpoint renvoie une
-- erreur serveur dès qu'une clé est fournie.
--
-- Sécurité : seules des EMPREINTES SHA-256 des clés sont stockées (jamais la clé
-- en clair). La validation hache la clé reçue et compare. RLS activée (aucun accès
-- client direct ; la fonction est SECURITY DEFINER et n'est appelée que côté serveur
-- via la service key).
--
-- ⚠️ À exécuter sur la base Supabase déployée (SQL Editor ou psql).

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.api_keys (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key_hash    TEXT NOT NULL UNIQUE,           -- SHA-256 hex de la clé en clair
  label       TEXT,                           -- description lisible (ex. "Feed Samsung SN")
  owner_id    UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  plan        TEXT NOT NULL DEFAULT 'basic' CHECK (plan IN ('basic','pro','premium')),
  allow_xml   BOOLEAN NOT NULL DEFAULT true,
  allow_json  BOOLEAN NOT NULL DEFAULT true,
  allow_csv   BOOLEAN NOT NULL DEFAULT false, -- réservé au plan premium
  daily_limit INT NOT NULL DEFAULT 1000,
  calls_today INT NOT NULL DEFAULT 0,
  last_call_date DATE,
  active      BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON public.api_keys(key_hash);

ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;
-- Aucun accès client direct : tout passe par la RPC / la service key.
DROP POLICY IF EXISTS "no_client_access_api_keys" ON public.api_keys;
CREATE POLICY "no_client_access_api_keys" ON public.api_keys FOR ALL USING (false) WITH CHECK (false);

-- ── RPC de validation ───────────────────────────────────────────────────────
-- Renvoie un JSON consommé tel quel par products-feed.js :
--   { valid:boolean, error?:string, plan?, allow_xml?, allow_json?, allow_csv?, remaining? }
-- Effets de bord : reset du compteur quotidien + incrément atomique des appels.
CREATE OR REPLACE FUNCTION public.api_key_validate(p_key TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rec public.api_keys%ROWTYPE;
  h   TEXT;
BEGIN
  IF p_key IS NULL OR length(p_key) < 8 THEN
    RETURN jsonb_build_object('valid', false, 'error', 'Clé manquante ou trop courte');
  END IF;

  h := encode(digest(p_key, 'sha256'), 'hex');

  SELECT * INTO rec FROM public.api_keys WHERE key_hash = h AND active = true;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('valid', false, 'error', 'Clé invalide');
  END IF;

  IF rec.expires_at IS NOT NULL AND rec.expires_at < now() THEN
    RETURN jsonb_build_object('valid', false, 'error', 'Clé expirée');
  END IF;

  -- Réinitialise le compteur si on a changé de jour.
  IF rec.last_call_date IS DISTINCT FROM CURRENT_DATE THEN
    rec.calls_today := 0;
  END IF;

  IF rec.calls_today >= rec.daily_limit THEN
    RETURN jsonb_build_object('valid', false, 'error', 'Quota quotidien dépassé');
  END IF;

  UPDATE public.api_keys
     SET calls_today = rec.calls_today + 1,
         last_call_date = CURRENT_DATE
   WHERE id = rec.id;

  RETURN jsonb_build_object(
    'valid', true,
    'plan', rec.plan,
    'allow_xml', rec.allow_xml,
    'allow_json', rec.allow_json,
    'allow_csv', rec.allow_csv,
    'remaining', GREATEST(0, rec.daily_limit - rec.calls_today - 1)
  );
END;
$$;

-- La RPC n'est appelée que côté serveur (service key). On retire l'accès public.
REVOKE ALL ON FUNCTION public.api_key_validate(TEXT) FROM PUBLIC, anon, authenticated;

COMMIT;

-- ── Exemple : créer une clé (à exécuter séparément, garder la clé en clair de côté) ──
-- WITH new_key AS (SELECT 'nxpro_' || encode(gen_random_bytes(16),'hex') AS k)
-- INSERT INTO public.api_keys (key_hash, label, plan, allow_csv, daily_limit)
-- SELECT encode(digest(k,'sha256'),'hex'), 'Feed démo', 'pro', false, 5000 FROM new_key
-- RETURNING (SELECT k FROM new_key) AS cle_en_clair_a_communiquer;
