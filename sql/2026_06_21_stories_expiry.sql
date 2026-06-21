-- ════════════════════════════════════════════════════════════════════════════
--  NEXUS Market — Stories : minuterie de suppression auto
--
--  La durée d'affichage d'une story est fixée à la publication selon l'offre
--  d'abonnement du vendeur (gratuit / Boutique Pro mensuel / annuel) — calculée
--  côté serveur dans functions/api/stories/upload.js et stockée dans `expires_at`
--  (la colonne existe déjà, défaut 30 jours).
--
--  Cette migration :
--   1. élargit la contrainte de statut pour autoriser 'expired' (nettoyage cron) ;
--   2. masque automatiquement les stories expirées en lecture publique (RLS) ;
--   3. ajoute un index sur expires_at pour le balayage d'expiration.
--
--  ⚠️ À exécuter sur la base Supabase déployée (SQL Editor ou psql). Idempotent.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- 1) Statuts autorisés (+ 'expired')
ALTER TABLE public.stories DROP CONSTRAINT IF EXISTS stories_status_check;
ALTER TABLE public.stories ADD CONSTRAINT stories_status_check
  CHECK (status = ANY (ARRAY['uploading','processing','active','errored','closed','pending_payment','expired']));

-- 2) Lecture publique : story active ET non expirée (la minuterie fait disparaître
--    la story sans dépendre du cron).
DROP POLICY IF EXISTS stories_public_read ON public.stories;
CREATE POLICY stories_public_read ON public.stories FOR SELECT
  USING (status = 'active' AND (expires_at IS NULL OR expires_at > now()));

-- 3) Index pour le balayage d'expiration (cron) et le filtre de lecture.
CREATE INDEX IF NOT EXISTS idx_stories_expires ON public.stories(expires_at);

COMMIT;
