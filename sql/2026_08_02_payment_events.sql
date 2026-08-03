-- ============================================================================
-- NEXUS Market — Journal IMMUABLE des événements de paiement (#1 roadmap pro)
-- ----------------------------------------------------------------------------
-- Piste d'audit financière : chaque étape (init, IPN payé/échoué, réconciliation,
-- écart détecté) est journalisée. Sert à : audit comptable, détection d'écarts,
-- support (« où en est ce paiement ? »), non-répudiation.
--
-- Appliquer : node scripts/db-query.mjs --file sql/2026_08_02_payment_events.sql
-- Écrit uniquement par le backend (service key, bypass RLS). Aucun accès anon/authenticated.
-- ============================================================================

create table if not exists public.payment_events (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  provider    text not null,          -- 'stripe' | 'paytech' | 'paydunya' | 'reconcile'
  event_type  text not null,          -- 'init' | 'ipn_paid' | 'ipn_failed' | 'reconciled_paid' | 'reconciled_failed' | 'discrepancy'
  order_id    uuid,                   -- nullable : les kinds boost/story/... utilisent un id synthétique
  ref         text,                   -- ref_command / token / transaction_id
  amount      numeric,                -- montant de la transaction
  currency    text default 'XOF',
  status      text,                   -- statut résultant (paid/failed/...)
  payload     jsonb,                  -- corps brut du webhook / contexte (audit)
  note        text
);

create index if not exists payment_events_order_idx    on public.payment_events (order_id);
create index if not exists payment_events_created_idx   on public.payment_events (created_at desc);
create index if not exists payment_events_provider_idx  on public.payment_events (provider, event_type);
create index if not exists payment_events_ref_idx       on public.payment_events (ref);

-- Journal immuable : RLS activée, aucune policy pour anon/authenticated → seul le
-- service_role (backend) peut écrire/lire (il bypasse la RLS de toute façon).
alter table public.payment_events enable row level security;
revoke all on public.payment_events from anon, authenticated;
grant select, insert on public.payment_events to service_role;

-- (Volontairement PAS de policy UPDATE/DELETE : un journal d'audit ne se modifie pas.)

comment on table public.payment_events is
  'Journal immuable des événements de paiement (audit financier) — écrit par le backend uniquement.';
