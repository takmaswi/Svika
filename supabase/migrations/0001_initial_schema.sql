-- =============================================================================
-- Svika · 0001_initial_schema
-- Schema mirrors docs/DATA-MODEL.md.
-- PostGIS is required for geography columns.
-- =============================================================================

create extension if not exists "postgis";
create extension if not exists "pgcrypto";

-- ----- users -----------------------------------------------------------------
create table public.users (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null,
  phone               text not null unique,
  role                text not null check (role in ('passenger','conductor','fleet_owner')),
  credit_balance_usd  numeric(10,2) not null default 0,
  created_at          timestamptz not null default now()
);

-- ----- routes ----------------------------------------------------------------
create table public.routes (
  id                          text primary key,
  name                        text not null,
  direction_summary           text,
  polyline                    geography(LineString, 4326),
  default_fare_usd            numeric(10,2) not null,
  typical_duration_minutes    integer not null,
  endpoint_start_stop_id      text,
  endpoint_end_stop_id        text,
  notes                       text,
  created_at                  timestamptz not null default now()
);

-- ----- stop_points -----------------------------------------------------------
create table public.stop_points (
  id            text primary key,
  name          text not null,
  location      geography(Point, 4326) not null,
  is_terminal   boolean not null default false,
  is_rank       boolean not null default false,
  created_at    timestamptz not null default now()
);

alter table public.routes
  add constraint routes_endpoint_start_fk
    foreign key (endpoint_start_stop_id) references public.stop_points(id);
alter table public.routes
  add constraint routes_endpoint_end_fk
    foreign key (endpoint_end_stop_id) references public.stop_points(id);

-- ----- route_stops -----------------------------------------------------------
create table public.route_stops (
  route_id   text not null references public.routes(id) on delete cascade,
  stop_id    text not null references public.stop_points(id) on delete cascade,
  sequence   integer not null,
  primary key (route_id, stop_id)
);

-- ----- fare_segments ---------------------------------------------------------
create table public.fare_segments (
  id              uuid primary key default gen_random_uuid(),
  route_id        text not null references public.routes(id) on delete cascade,
  from_stop_id    text not null references public.stop_points(id),
  to_stop_id      text not null references public.stop_points(id),
  fare_usd        numeric(10,2) not null,
  effective_from  timestamptz not null default now(),
  unique (route_id, from_stop_id, to_stop_id, effective_from)
);

-- ----- transfer_points -------------------------------------------------------
create table public.transfer_points (
  id                          text primary key,
  type                        text not null check (type in ('rank_to_rank_walk','walking_junction')),
  from_stop_id                text not null references public.stop_points(id),
  to_stop_id                  text not null references public.stop_points(id),
  walking_distance_meters     integer not null,
  walking_duration_minutes    integer not null,
  walking_polyline            geography(LineString, 4326),
  notes                       text
);

-- ----- vehicles --------------------------------------------------------------
create table public.vehicles (
  id                          text primary key,
  route_id                    text not null references public.routes(id),
  fleet_owner_id              uuid not null references public.users(id),
  current_conductor_id        uuid references public.users(id),
  capacity_seats              integer not null default 15,
  current_position            geography(Point, 4326),
  current_passenger_count     integer not null default 0,
  direction                   text check (direction in ('outbound','inbound')),
  last_position_at            timestamptz
);

-- ----- tickets ---------------------------------------------------------------
create table public.tickets (
  id                       uuid primary key default gen_random_uuid(),
  access_code              text not null,
  route_id                 text not null references public.routes(id),
  board_at_stop_id         text not null references public.stop_points(id),
  alight_at_stop_id        text not null references public.stop_points(id),
  fare_usd                 numeric(10,2) not null,
  originating_user_id      uuid references public.users(id),
  current_holder_user_id   uuid references public.users(id),
  vehicle_id               text references public.vehicles(id),
  status                   text not null check (status in
    ('issued','transferred_pending','held','redeemed','completed','expired','cash_walkin')),
  kind                     text not null default 'passenger' check (kind in ('passenger','parcel')),
  parcel_receiver_phone    text,
  parcel_description       text,
  created_at               timestamptz not null default now(),
  redeemed_at              timestamptz,
  completed_at             timestamptz
);

-- Partial unique index — access_code is unique among non-completed tickets.
create unique index tickets_access_code_active_idx on public.tickets(access_code)
  where status in ('issued','transferred_pending','held','redeemed');

-- ----- trips -----------------------------------------------------------------
create table public.trips (
  id                       uuid primary key default gen_random_uuid(),
  originating_user_id      uuid not null references public.users(id),
  origin_stop_id           text not null references public.stop_points(id),
  destination_stop_id      text not null references public.stop_points(id),
  selected_option_label    text not null,
  total_fare_usd           numeric(10,2) not null,
  total_duration_minutes   integer not null,
  created_at               timestamptz not null default now()
);

create table public.trip_tickets (
  trip_id    uuid not null references public.trips(id) on delete cascade,
  ticket_id  uuid not null references public.tickets(id) on delete cascade,
  sequence   integer not null,
  primary key (trip_id, ticket_id)
);

-- ----- transfers -------------------------------------------------------------
create table public.transfers (
  id                uuid primary key default gen_random_uuid(),
  ticket_id         uuid not null references public.tickets(id),
  from_user_id      uuid not null references public.users(id),
  to_user_id        uuid references public.users(id),
  to_phone          text,
  transferred_at    timestamptz not null default now(),
  claimed_at        timestamptz
);

-- ----- kombi_pings -----------------------------------------------------------
create table public.kombi_pings (
  id                bigserial primary key,
  vehicle_id        text not null references public.vehicles(id),
  position          geography(Point, 4326) not null,
  nearest_stop_id   text references public.stop_points(id),
  is_at_stop        boolean not null default false,
  recorded_at       timestamptz not null default now()
);

-- ----- audit_narratives ------------------------------------------------------
create table public.audit_narratives (
  id                              uuid primary key default gen_random_uuid(),
  vehicle_id                      text not null references public.vehicles(id),
  for_date                        date not null,
  english_text                    text not null,
  shona_text                      text not null,
  stops_made                      integer not null,
  digital_fares_logged            integer not null,
  cash_walkons_logged             integer not null,
  revenue_gap_estimate_usd        numeric(10,2) not null,
  zimra_liability_estimate_usd    numeric(10,2) not null,
  generated_at                    timestamptz not null default now(),
  unique (vehicle_id, for_date)
);
