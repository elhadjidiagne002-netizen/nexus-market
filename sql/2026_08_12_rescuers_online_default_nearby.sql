-- ============================================================================
-- Dépanneurs : « en ligne par défaut » (comme les coursiers) + RPC proposant TOUS
-- les dépanneurs proches (avec téléphone), position live si en ligne sinon domicile.
-- ============================================================================

-- 1) Disponible par défaut + backfill des dépanneurs actifs.
alter table public.rescuers alter column is_available set default true;
update public.rescuers set is_available = true
 where status = 'active' and is_available is distinct from true;

-- 2) RPC : dépanneurs proposables (TOUS les actifs), triés « en ligne d'abord » puis
--    distance, AVEC téléphone/WhatsApp. Position = live si en ligne (is_available + ping
--    < 30 min), sinon position d'inscription (home_lat/lng), sinon dernière connue.
create or replace function public.nearby_rescuers_offline(
  p_lat double precision,
  p_lng double precision,
  p_radius_m integer default 30000,
  p_limit integer default 10
)
returns table(
  rescuer_id uuid, user_id uuid, name text, phone text, whatsapp text,
  vehicle_type text, specialties text[],
  distance_km numeric, rating_avg numeric, rating_count integer,
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
      r.id as rescuer_id, r.user_id, r.name,
      coalesce(nullif(r.phone,''), p.phone) as phone,
      coalesce(nullif(p.wave_phone,''), nullif(p.orange_phone,''), nullif(r.phone,''), p.phone) as whatsapp,
      r.vehicle_type, r.specialties,
      (r.is_available = true and p.location_updated_at > now() - interval '30 minutes') as is_online,
      case
        when (r.is_available = true and p.location_updated_at > now() - interval '30 minutes')
             and p.geolocation is not null then p.geolocation
        when p.home_lat is not null and p.home_lng is not null
             then ST_SetSRID(ST_MakePoint(p.home_lng, p.home_lat), 4326)::geography
        else p.geolocation
      end as ref_geo,
      case
        when (r.is_available = true and p.location_updated_at > now() - interval '30 minutes')
             and p.geolocation is not null then 'live'
        when p.home_lat is not null and p.home_lng is not null then 'inscription'
        else 'derniere_position'
      end as based_on,
      r.rating_avg, r.rating_count
    from public.rescuers r
    join public.profiles p on p.id = r.user_id
    where r.status = 'active'
  )
  select
    b.rescuer_id, b.user_id, b.name, b.phone, b.whatsapp, b.vehicle_type, b.specialties,
    round((ST_Distance(b.ref_geo, t.g) / 1000.0)::numeric, 2) as distance_km,
    b.rating_avg, b.rating_count, b.is_online, b.based_on
  from base b, target t
  where b.ref_geo is not null
    and ST_DWithin(b.ref_geo, t.g, greatest(p_radius_m, 0))
  order by b.is_online desc, b.ref_geo <-> t.g
  limit greatest(p_limit, 1);
$$;

grant execute on function public.nearby_rescuers_offline(double precision, double precision, integer, integer) to anon, authenticated;
