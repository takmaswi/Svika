-- =============================================================================
-- Svika · 0006_wa_nearest_vehicle
-- Phase 4 — WhatsApp companion's "kombi near me" command needs a fast nearest-
-- active-vehicle lookup against vehicles.current_position. Wraps PostGIS
-- ST_Distance over geography so the client never has to handle EWKB hex.
--
-- Active = position recorded within the last 30 minutes. Returns straight-line
-- distance in metres plus a coarse arrival estimate based on a 25 km/h average
-- (kombi pace through Harare arterials).
-- =============================================================================

create or replace function public.nearest_vehicles_to_point(
  in_lat double precision,
  in_lng double precision,
  in_limit integer default 1
)
returns table (
  vehicle_id text,
  route_id text,
  route_name text,
  distance_meters double precision,
  estimated_minutes integer,
  current_passenger_count integer,
  capacity_seats integer,
  last_position_at timestamptz
)
language sql
stable
as $$
  with anchor as (
    select st_setsrid(st_makepoint(in_lng, in_lat), 4326)::geography as g
  )
  select
    v.id as vehicle_id,
    v.route_id,
    r.name as route_name,
    st_distance(v.current_position, anchor.g) as distance_meters,
    -- 25 km/h average → 25000 m/h → ~417 m/min → ceil(distance / 417) + 1
    greatest(1, ceil(st_distance(v.current_position, anchor.g) / 417.0)::integer + 1)
      as estimated_minutes,
    v.current_passenger_count,
    v.capacity_seats,
    v.last_position_at
  from public.vehicles v
  cross join anchor
  join public.routes r on r.id = v.route_id
  where v.current_position is not null
    and v.last_position_at >= now() - interval '30 minutes'
  order by st_distance(v.current_position, anchor.g) asc
  limit greatest(1, in_limit);
$$;
