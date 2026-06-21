-- 2026_06_21_public_chat_v3.sql
-- Chat communautaire v3 : messages épinglés (admin) + signalement (compteur) +
-- RPC de signalement utilisable par les visiteurs anonymes (SECURITY DEFINER).
-- Idempotent. À exécuter APRÈS 2026_06_21_public_chat_v2.sql.

BEGIN;

ALTER TABLE public.public_chat ADD COLUMN IF NOT EXISTS pinned  boolean NOT NULL DEFAULT false;
ALTER TABLE public.public_chat ADD COLUMN IF NOT EXISTS reports integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_public_chat_pinned   ON public.public_chat (room) WHERE pinned = true;
CREATE INDEX IF NOT EXISTS idx_public_chat_reported ON public.public_chat (reports) WHERE reports > 0;

-- Signalement : incrément atomique du compteur, accessible à TOUT visiteur
-- (les RLS UPDATE restent réservées à l'auteur/admin ; le report passe par ce RPC).
CREATE OR REPLACE FUNCTION public.chat_report(p_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.public_chat SET reports = reports + 1 WHERE id = p_id;
$$;

GRANT EXECUTE ON FUNCTION public.chat_report(uuid) TO anon, authenticated;

COMMIT;
