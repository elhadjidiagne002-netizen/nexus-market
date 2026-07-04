-- =====================================================================
-- Coursier : fallback "propose quand même" quand AUCUN coursier n'est en ligne.
-- Propose les coursiers dont le DOMICILE déclaré (à défaut, la dernière position
-- connue) est proche du point de retrait, avec leurs coordonnées de contact.
-- Appliqué en prod (pqcqbstbdujzaclsiosv) le 2026-07-04.
-- =====================================================================

-- Domicile déclaré du coursier (lieu d'enregistrement), distinct de la position live.
-- Capturé au 1er ping GPS du coursier (front, idempotent WHERE home_lat IS NULL).
alter table public.profiles
  add column if not exists home_lat double precision,
  add column if not exists home_lng double precision;

comment on column public.profiles.home_lat is 'Latitude du domicile déclaré (coursier) — base du fallback hors-ligne';
comment on column public.profiles.home_lng is 'Longitude du domicile déclaré (coursier)';

-- RPC fallback : coursiers proposables même hors-ligne, triés « en ligne d'abord »
-- puis par distance au point donné. AUCUN filtre is_available / fraîcheur.
create or replace function public.nearby_couriers_offline(
  p_lat double precision,
  p_lng double precision,
  p_radius_m integer default 30000,
  p_limit integer default 8
)
returns table(
  courier_id uuid, user_id uuid, name text, phone text,
  whatsapp text, vehicle_type text, zone text,
  distance_km numeric, rating_avg numeric, deliveries_done integer,
  is_online boolean, based_on text
)
language sql stable security definer
set search_path to 'public', 'extensions'
as $$
  with target as (
    select ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography as g
  ),
  base as (
    select
      c.id as courier_id, c.user_id, c.name,
      coalesce(nullif(c.phone,''), p.phone) as phone,
      coalesce(nullif(p.wave_phone,''), nullif(p.orange_phone,''), nullif(c.phone,''), p.phone) as whatsapp,
      c.vehicle_type,
      coalesce(p.courier_zone, (case when array_length(c.zones,1) > 0 then c.zones[1] else null end)) as zone,
      case
        when p.home_lat is not null and p.home_lng is not null
          then ST_SetSRID(ST_MakePoint(p.home_lng, p.home_lat), 4326)::geography
        else p.geolocation
      end as ref_geo,
      case when p.home_lat is not null and p.home_lng is not null then 'domicile' else 'derniere_position' end as based_on,
      c.rating_avg, c.deliveries_done,
      (c.is_available = true and p.location_updated_at > now() - interval '30 minutes') as is_online
    from public.couriers c
    join public.profiles p on p.id = c.user_id
    where c.status = 'active'
  )
  select
    b.courier_id, b.user_id, b.name, b.phone, b.whatsapp, b.vehicle_type, b.zone,
    round((ST_Distance(b.ref_geo, t.g) / 1000.0)::numeric, 2) as distance_km,
    b.rating_avg, b.deliveries_done, b.is_online, b.based_on
  from base b, target t
  where b.ref_geo is not null
    and ST_DWithin(b.ref_geo, t.g, greatest(p_radius_m, 0))
  order by b.is_online desc, b.ref_geo <-> t.g
  limit greatest(p_limit, 1);
$$;

grant execute on function public.nearby_couriers_offline(double precision, double precision, integer, integer) to anon, authenticated;
