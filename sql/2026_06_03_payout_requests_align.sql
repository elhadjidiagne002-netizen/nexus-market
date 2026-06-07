-- ============================================================
-- 2026_06_03_payout_requests_align.sql
-- Aligne la table payout_requests sur le schéma attendu par le code backend
-- (functions/payout-request.js, payout-history.js, paytech-payout-webhook.js).
--
-- Contexte : ces fichiers écrivent/lisent des colonnes qui n'existaient pas
-- dans la définition canonique (amount_xof, ref_command, paytech_token, etc.)
-- → tout INSERT/SELECT/UPDATE échouait. Migration ADDITIVE (aucune donnée perdue).
-- À exécuter une fois dans Supabase (SQL Editor).
-- ============================================================

-- ── Colonnes manquantes ─────────────────────────────────────
ALTER TABLE payout_requests ADD COLUMN IF NOT EXISTS amount_xof      BIGINT;
ALTER TABLE payout_requests ADD COLUMN IF NOT EXISTS vendor_email    TEXT;
ALTER TABLE payout_requests ADD COLUMN IF NOT EXISTS ref_command     TEXT;
ALTER TABLE payout_requests ADD COLUMN IF NOT EXISTS paytech_ref     TEXT;
ALTER TABLE payout_requests ADD COLUMN IF NOT EXISTS paytech_token   TEXT;
ALTER TABLE payout_requests ADD COLUMN IF NOT EXISTS paid_at         TIMESTAMPTZ;
ALTER TABLE payout_requests ADD COLUMN IF NOT EXISTS failed_at       TIMESTAMPTZ;
ALTER TABLE payout_requests ADD COLUMN IF NOT EXISTS failure_reason  TEXT;

-- Index pour la recherche par référence PayTech (lookup dans le webhook payout)
CREATE INDEX IF NOT EXISTS idx_payouts_ref_command ON payout_requests(ref_command);

-- ── Élargir la contrainte CHECK sur status ──────────────────
-- Le code utilise les statuts : pending, processing, paid, failed (en plus de
-- l'ancien 'rejected'). On reconstruit la contrainte pour les autoriser tous.
DO $$
DECLARE
  cname TEXT;
BEGIN
  SELECT conname INTO cname
  FROM pg_constraint
  WHERE conrelid = 'payout_requests'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%status%';

  IF cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE payout_requests DROP CONSTRAINT %I', cname);
  END IF;

  ALTER TABLE payout_requests
    ADD CONSTRAINT payout_requests_status_check
    CHECK (status IN ('pending','processing','paid','failed','rejected'));
END $$;
