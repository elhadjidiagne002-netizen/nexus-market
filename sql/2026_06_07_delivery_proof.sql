-- 2026_06_07_delivery_proof.sql
-- Confirmation de livraison par photo avant libération des fonds (escrow) — RT-04 / #13.
-- Ajoute la preuve de livraison sur les commandes. Quand l'option serveur
-- REQUIRE_DELIVERY_PHOTO est active, seules les commandes livrées AVEC preuve
-- comptent dans le solde retirable du vendeur (cf. functions/payout-request.js).
--
-- ⚠️ À exécuter sur la base Supabase déployée (SQL Editor ou psql).

BEGIN;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS delivery_photo_url   TEXT,
  ADD COLUMN IF NOT EXISTS delivery_confirmed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS delivery_confirmed_by TEXT;  -- 'buyer' | 'vendor' | 'courier'

COMMIT;
