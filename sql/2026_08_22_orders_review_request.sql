-- ============================================================================
-- SOLLICITATION D'AVIS APRÈS LIVRAISON : ajoute review_requested_at à orders,
-- utilisé par functions/cron/review-request.js pour ne solliciter qu'UNE fois
-- par commande livrée (évite de relancer le même acheteur à chaque exécution).
-- Idempotent (IF NOT EXISTS).
-- ============================================================================

alter table public.orders
  add column if not exists review_requested_at timestamptz;

comment on column public.orders.review_requested_at is
  'Horodatage de la demande d''avis envoyée après livraison (NULL = jamais sollicité). Posé par functions/cron/review-request.js.';

-- Index partiel : le cron ne balaie que les commandes livrées non encore sollicitées.
create index if not exists idx_orders_review_pending
  on public.orders (delivered_at)
  where review_requested_at is null and delivered_at is not null;
