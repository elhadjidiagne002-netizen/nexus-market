-- ════════════════════════════════════════════════════════════════════════════
--  NEXUS Market — Stories payantes : statut 'pending_payment'
--
--  Gate « stories payantes pour le vendeur » (régulé par l'admin via
--  nexus_monetization_cfg.story_fee, défaut 0 = gratuit). Si tarif > 0, la story
--  est créée en 'pending_payment' (non visible) jusqu'au paiement. On élargit
--  donc la contrainte de statut. Idempotent.
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.stories DROP CONSTRAINT IF EXISTS stories_status_check;
ALTER TABLE public.stories ADD CONSTRAINT stories_status_check
  CHECK (status = ANY (ARRAY['uploading','processing','active','errored','closed','pending_payment']));
