-- 2026_06_07_wa_tracking.sql
-- [REVENU PASSIF #15] Option payante « Suivi Premium WhatsApp » au checkout.
-- L'acheteur coche l'option (+150 FCFA) → wa_tracking = true ; il reçoit alors
-- des alertes WhatsApp à chaque changement de statut (via functions/api/wa-tracking.js).
--
-- ⚠️ À exécuter sur la base Supabase déployée (SQL Editor ou psql).

BEGIN;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS wa_tracking      BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS wa_tracking_last TEXT;  -- dernier statut notifié (anti-doublon)

COMMIT;
