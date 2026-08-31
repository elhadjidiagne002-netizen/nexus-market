-- Cache nom d'arrêt -> coordonnées, alimenté par scripts/geocode-stops.mjs
-- (Nominatim/OpenStreetMap, gratuit, sans clé). Sert la carte inline (approximative)
-- des itinéraires de bus urbains AFTU/Dakar Dem Dikk dans CovoiturageModal.
create table public.transport_stops_geo (
  stop_name text primary key,
  lat double precision,
  lng double precision,
  formatted_address text,
  geocode_status text not null default 'pending' check (geocode_status in ('ok','not_found','error','pending')),
  source text not null default 'nominatim_openstreetmap',
  geocoded_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.transport_stops_geo enable row level security;

create policy "transport_stops_geo_public_read" on public.transport_stops_geo
  for select using (true);

grant select on public.transport_stops_geo to anon, authenticated;
