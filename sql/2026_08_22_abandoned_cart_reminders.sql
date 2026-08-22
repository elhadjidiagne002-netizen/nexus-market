-- ============================================================================
-- RELANCE PANIER ABANDONNÉ — table de suivi des relances déjà envoyées.
--
-- POURQUOI cette table : `carts` (une ligne par user, UNIQUE(user_id)) n'a ni
-- created_at ni flag « relancé » — seulement updated_at, touché par trigger à
-- chaque modification du panier. Sans mémoire externe, le cron horaire
-- renverrait le MÊME message à la même personne à chaque passage tant que son
-- panier reste inchangé (spam garanti, et blocage WhatsApp à la clé).
--
-- Règle appliquée par le cron (functions/cron/abandoned-cart.js) :
--   · une seule relance par panier « version » (on mémorise cart_updated_at) ;
--   · si l'utilisateur modifie ensuite son panier (updated_at change), il
--     redevient éligible à une nouvelle relance plus tard ;
--   · délai minimal entre deux relances au même utilisateur : voir le cron.
-- ============================================================================

create table if not exists public.abandoned_cart_reminders (
  user_id          uuid primary key references public.profiles(id) on delete cascade,
  cart_updated_at  timestamptz not null,   -- version du panier relancée (carts.updated_at au moment de l'envoi)
  reminded_at      timestamptz not null default now(),
  reminder_count   integer     not null default 1
);

comment on table public.abandoned_cart_reminders is
  'Anti-doublon des relances de panier abandonné : mémorise quelle version du panier (cart_updated_at) a déjà été relancée pour chaque utilisateur.';

-- Le cron lit/écrit via la SERVICE KEY (bypass RLS), mais on active RLS pour
-- que la table ne soit jamais lisible par anon/authenticated (données de
-- ciblage marketing, aucun intérêt côté client).
alter table public.abandoned_cart_reminders enable row level security;

revoke all on public.abandoned_cart_reminders from anon, authenticated;

-- Index de purge (le cron cleanup peut supprimer les vieilles lignes).
create index if not exists idx_abandoned_cart_reminders_reminded_at
  on public.abandoned_cart_reminders (reminded_at);
