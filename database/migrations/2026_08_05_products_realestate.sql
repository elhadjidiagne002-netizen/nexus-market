-- =====================================================================
-- NEXUS Immobilier — vertical d'annonces immobilières (location/vente :
-- appartement, maison, villa, studio, terrain, bureau/commercial, chambre).
-- MVP : annonce + mise en relation WhatsApp (pas de flux transactionnel),
-- même pattern que NEXUS Location (is_rental/rental_specs).
--
-- Suit le pattern d'extension existant `is_animal`/`animal_specs`,
-- `is_rental`/`rental_specs`.
-- =====================================================================
alter table public.products
  add column if not exists is_realestate boolean not null default false,
  add column if not exists realestate_specs jsonb;

-- La vitrine immobilier filtre is_realestate=true AND active=true, triée par date.
create index if not exists idx_products_realestate
  on public.products (created_at desc)
  where is_realestate = true and active = true;

comment on column public.products.is_realestate is
  'Bien immobilier proposé (vertical NEXUS Immobilier)';
comment on column public.products.realestate_specs is
  'jsonb {transaction(location|vente), property_type, surface_m2, rooms, bedrooms,
   bathrooms, furnished, price_period(mois, si location), region, amenities[]}';
