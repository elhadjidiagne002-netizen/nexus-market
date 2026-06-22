-- ════════════════════════════════════════════════════════════════════════════
--  NEXUS Market — Litiges : colonnes de résolution + remboursement
--
--  resolveDispute (admin) fonctionne désormais en tout-Supabase : il résout le
--  litige et crédite l'acheteur (cashback NEXUS). On garantit la présence des
--  colonnes écrites. Idempotent. ⚠️ À exécuter dans Supabase → SQL Editor.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

ALTER TABLE public.disputes ADD COLUMN IF NOT EXISTS resolution        text;
ALTER TABLE public.disputes ADD COLUMN IF NOT EXISTS admin_notes       text;
ALTER TABLE public.disputes ADD COLUMN IF NOT EXISTS refund_percent    integer;
ALTER TABLE public.disputes ADD COLUMN IF NOT EXISTS refund_amount_xof integer;
ALTER TABLE public.disputes ADD COLUMN IF NOT EXISTS resolved_at       timestamptz;

ALTER TABLE public.orders   ADD COLUMN IF NOT EXISTS refunded_at       timestamptz;

COMMIT;
