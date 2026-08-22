-- ============================================================================
-- RELANCE PANIER ABANDONNÉ : ajoute reminder_sent_at à carts, utilisé par
-- functions/cron/abandoned-cart.js pour n'envoyer qu'UNE relance par épisode
-- d'abandon (évite de marteler le même client à chaque exécution horaire).
-- Idempotent (IF NOT EXISTS).
-- ============================================================================

alter table public.carts
  add column if not exists reminder_sent_at timestamptz;

comment on column public.carts.reminder_sent_at is
  'Horodatage de la dernière relance panier abandonné envoyée (NULL = jamais relancé pour ce contenu de panier). Posé par functions/cron/abandoned-cart.js.';
