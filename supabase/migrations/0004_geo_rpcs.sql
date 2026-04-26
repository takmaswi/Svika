-- =============================================================================
-- Svika · 0004_geo_rpcs — expose PostGIS geometry to the client as plain GeoJSON.
--
-- PostgREST surfaces geography columns as opaque EWKB hex by default. The
-- passenger map needs polyline + stop coordinates. Two stable functions keep
-- the client free of any PostGIS handling.
-- =============================================================================

create or replace function public.routes_geojson()
returns table (
  id text,
  name text,
  direction_summary text,
  default_fare_usd numeric,
  typical_duration_minutes integer,
  endpoint_start_stop_id text,
  endpoint_end_stop_id text,
  geojson jsonb
)
language sql
stable
as $$
  select
    r.id,
    r.name,
    r.direction_summary,
    r.default_fare_usd,
    r.typical_duration_minutes,
    r.endpoint_start_stop_id,
    r.endpoint_end_stop_id,
    case when r.polyline is null then null
         else st_asgeojson(r.polyline)::jsonb
    end as geojson
  from public.routes r
  order by r.id;
$$;

create or replace function public.stop_points_geojson()
returns table (
  id text,
  name text,
  lng double precision,
  lat double precision,
  is_terminal boolean,
  is_rank boolean
)
language sql
stable
as $$
  select
    s.id,
    s.name,
    st_x(s.location::geometry) as lng,
    st_y(s.location::geometry) as lat,
    s.is_terminal,
    s.is_rank
  from public.stop_points s
  order by s.id;
$$;

create or replace function public.route_stops_ordered()
returns table (
  route_id text,
  stop_id text,
  sequence integer,
  stop_name text,
  lng double precision,
  lat double precision,
  is_terminal boolean,
  is_rank boolean
)
language sql
stable
as $$
  select
    rs.route_id,
    rs.stop_id,
    rs.sequence,
    s.name as stop_name,
    st_x(s.location::geometry) as lng,
    st_y(s.location::geometry) as lat,
    s.is_terminal,
    s.is_rank
  from public.route_stops rs
  join public.stop_points s on s.id = rs.stop_id
  order by rs.route_id, rs.sequence;
$$;
