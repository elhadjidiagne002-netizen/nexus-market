-- =====================================================================
-- Coursiers : « en ligne / disponibles par défaut » + géoloc live-si-en-ligne,
-- sinon position d'inscription (domicile). Support de la demande produit :
--   · ne plus exposer le nombre de livreurs en ligne au commanditaire (front) ;
--   · tous les livreurs inscrits sont proposables par défaut ;
--   · position live UNIQUEMENT si le coursier est réellement en ligne, sinon
--     sa position enregistrée à l'inscription (home_lat/lng), sinon dernière connue.
-- =====================================================================

-- 1) Disponible par défaut à l'inscription + backfill des coursiers actifs.
alter table public.couriers alter column is_available set default true;
update public.couriers
   set is_available = true
 where status = 'active' and is_available is distinct from true;

-- 2) RPC : coursiers proposables (TOUS les actifs), triés « en ligne d'abord » puis
--    distance. La position de référence = LIVE si en ligne (is_available + ping < 30 min),
--    sinon la position d'inscription (home_lat/lng), sinon la dernière position connue.
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
      (c.is_available = true and p.location_updated_at > now() - interval '30 minutes') as is_online,
      -- position de référence : live si en ligne, sinon domicile (inscription), sinon dernière.
      case
        when (c.is_available = true and p.location_updated_at > now() - interval '30 minutes')
             and p.geolocation is not null
          then p.geolocation
        when p.home_lat is not null and p.home_lng is not null
          then ST_SetSRID(ST_MakePoint(p.home_lng, p.home_lat), 4326)::geography
        else p.geolocation
      end as ref_geo,
      case
        when (c.is_available = true and p.location_updated_at > now() - interval '30 minutes')
             and p.geolocation is not null then 'live'
        when p.home_lat is not null and p.home_lng is not null then 'inscription'
        else 'derniere_position'
      end as based_on,
      c.rating_avg, c.deliveries_done
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
