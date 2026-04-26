-- =============================================================================
-- Svika · 0002_indexes — performance-shaped indexes per docs/DATA-MODEL.md.
-- =============================================================================

create index vehicles_route_idx on public.vehicles(route_id);
create index kombi_pings_latest_idx on public.kombi_pings(vehicle_id, recorded_at desc);
create index tickets_originator_history_idx
  on public.tickets(originating_user_id, created_at desc);
create index tickets_holder_status_idx
  on public.tickets(current_holder_user_id, status);
create index trips_user_idx on public.trips(originating_user_id, created_at desc);
create index transfers_ticket_idx on public.transfers(ticket_id);

create index stop_points_location_gist on public.stop_points using gist(location);
create index routes_polyline_gist on public.routes using gist(polyline);
create index transfer_points_walk_gist on public.transfer_points using gist(walking_polyline);
create index kombi_pings_position_gist on public.kombi_pings using gist(position);
create index vehicles_position_gist on public.vehicles using gist(current_position);
