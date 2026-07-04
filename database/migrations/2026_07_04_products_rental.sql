-- =====================================================================
-- NEXUS Location — vertical de location d'objets (matériel événementiel,
-- outillage BTP, etc.) entre particuliers/artisans.
-- MVP : annonce + mise en relation WhatsApp (pas de flux transactionnel),
-- caution affichée à titre indicatif (échange en direct loueur/locataire).
--
-- Suit le pattern d'extension existant `is_animal`/`animal_specs`.
-- Appliqué en prod (pqcqbstbdujzaclsiosv) le 2026-07-04.
-- =====================================================================
alter table public.products
  add column if not exists is_rental boolean not null default false,
  add column if not exists rental_specs jsonb;

-- La vitrine location filtre is_rental=true AND active=true, triée par date.
create index if not exists idx_products_rental
  on public.products (created_at desc)
  where is_rental = true and active = true;

comment on column public.products.is_rental is
  'Objet proposé à la location (vertical NEXUS Location)';
comment on column public.products.rental_specs is
  'jsonb {price_per_day, price_per_week, deposit_fcfa, min_days, max_days, condition, region}';
