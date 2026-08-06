-- ════════════════════════════════════════════════════════════════════════════
--  NEXUS Market — Vérification d'email par code à 6 chiffres à l'inscription
--  (comme les grands sites : Amazon, etc.) en complément du lien natif
--  Supabase Auth déjà en place.
--
--  Le code n'est JAMAIS stocké en clair (seul le hash SHA-256 est conservé) —
--  ni lu ni écrit par le client : uniquement par les endpoints serveur
--  functions/api/auth/send-verification-code.js et verify-code.js (service_role,
--  RLS sans aucune policy anon/authenticated).
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.email_verification_codes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  email       text NOT NULL,
  code_hash   text NOT NULL,
  attempts    integer NOT NULL DEFAULT 0,
  expires_at  timestamptz NOT NULL,
  verified_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_verif_codes_email
  ON public.email_verification_codes (lower(email), created_at DESC);

ALTER TABLE public.email_verification_codes ENABLE ROW LEVEL SECURITY;
-- Aucune policy anon/authenticated : accès exclusivement via service_role
-- (les deux endpoints serveur), jamais depuis le navigateur.

-- Purge des codes expirés > 24h (hygiène, appelée par le cron cleanup existant
-- si présent ; sans effet si non appelée — la table reste petite de toute façon).
CREATE OR REPLACE FUNCTION public.cleanup_expired_verification_codes()
RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
  DELETE FROM public.email_verification_codes WHERE expires_at < now() - interval '24 hours';
$$;
REVOKE ALL ON FUNCTION public.cleanup_expired_verification_codes() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cleanup_expired_verification_codes() TO service_role;
