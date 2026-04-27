# Data Model — Svika

## Design principles

- Plain tables, plain columns, plain foreign keys. No premature optimisation.
- Fares are stored as data, never hardcoded. Per-segment fare rows support fuel-driven price changes without code redeploys.
- Ticket state is enforced server-side by the database, not by the client.
- The same model supports passengers, transferable tickets, cash walk-ons, and parcels — a parcel is a special kind of ticket.
- PostGIS is used for stop-point coordinates and route polylines. Distance and nearest-kombi calculations happen in the database.
- Row-level security is enabled only where it matters for the demo personas.

## Tables

### `users`

Represents passengers, conductors, and fleet owners. Demo accounts are pre-seeded.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid (primary key) | |
| `name` | text | "Takunda", "Rudo", "Farai", "Baba Tino" |
| `phone` | text | International format, used for the WhatsApp transfer flow |
| `role` | text | One of `passenger`, `conductor`, `fleet_owner` |
| `credit_balance_usd` | numeric | Pre-loaded for the demo |
| `created_at` | timestamptz | |

### `routes`

The fixed kombi routes. Loaded from `seed/network.json` during database initialisation.

| Column | Type | Notes |
|---|---|---|
| `id` | text (primary key) | Matches the `id` field in the seed file |
| `name` | text | Human-readable name |
| `direction_summary` | text | Plain-English path description |
| `polyline` | geography(LineString, 4326) | Route polyline using PostGIS |
| `default_fare_usd` | numeric | End-to-end fare |
| `typical_duration_minutes` | integer | |
| `endpoint_start_stop_id` | text foreign key | References `stop_points.id` |
| `endpoint_end_stop_id` | text foreign key | References `stop_points.id` |
| `notes` | text | |

### `stop_points`

Named places where kombis pick up or drop off passengers. Includes ranks. Stop points are shared across routes.

| Column | Type | Notes |
|---|---|---|
| `id` | text (primary key) | Matches the seed file |
| `name` | text | Human-readable name |
| `location` | geography(Point, 4326) | Latitude and longitude |
| `is_terminal` | boolean | True if this is an endpoint of a route |
| `is_rank` | boolean | True if this is a multi-route hub |

### `route_stops`

Join table connecting routes to their stop points, ordered.

| Column | Type | Notes |
|---|---|---|
| `route_id` | text foreign key | |
| `stop_id` | text foreign key | |
| `sequence` | integer | Order along the route, 0-indexed |
| Primary key | composite (`route_id`, `stop_id`) | |

### `fare_segments`

Per-segment fares. The reason fares are not on the route is so that a price change for one segment does not require updating the whole route.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid (primary key) | |
| `route_id` | text foreign key | |
| `from_stop_id` | text foreign key | |
| `to_stop_id` | text foreign key | |
| `fare_usd` | numeric | |
| `effective_from` | timestamptz | Allows fare history |
| Unique index | (`route_id`, `from_stop_id`, `to_stop_id`, `effective_from`) | |

### `transfer_points`

Connections between routes — either a rank-internal walk or a walking junction at street corners.

| Column | Type | Notes |
|---|---|---|
| `id` | text (primary key) | Matches the seed file |
| `type` | text | `rank_to_rank_walk` or `walking_junction` |
| `from_stop_id` | text foreign key | |
| `to_stop_id` | text foreign key | |
| `walking_distance_meters` | integer | |
| `walking_duration_minutes` | integer | |
| `walking_polyline` | geography(LineString, 4326) | |
| `notes` | text | |

### `vehicles`

Individual kombis. Each is bound to one route. Position is updated by the simulation runner.

| Column | Type | Notes |
|---|---|---|
| `id` | text (primary key) | Registration plate, e.g. "ZH 4821" |
| `route_id` | text foreign key | |
| `fleet_owner_id` | uuid foreign key | References `users.id` |
| `current_conductor_id` | uuid foreign key | References `users.id`, nullable |
| `capacity_seats` | integer | Default 15 for a Toyota Hiace |
| `current_position` | geography(Point, 4326) | |
| `current_passenger_count` | integer | |
| `direction` | text | `outbound` or `inbound` along the route |
| `last_position_at` | timestamptz | |

### `tickets`

The unit of value. Issued by the trip planner, transferable, redeemable.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid (primary key) | |
| `access_code` | text | Three digits, unique among non-completed tickets |
| `route_id` | text foreign key | The route this ticket is valid for |
| `board_at_stop_id` | text foreign key | Where the holder boards |
| `alight_at_stop_id` | text foreign key | Where the holder alights |
| `fare_usd` | numeric | Locked at purchase time |
| `originating_user_id` | uuid foreign key | Who paid |
| `current_holder_user_id` | uuid foreign key | Who can redeem now |
| `vehicle_id` | text foreign key | Set on redemption |
| `status` | text | `issued`, `transferred_pending`, `held`, `redeemed`, `completed`, `expired`, `cash_walkin` |
| `kind` | text | `passenger` or `parcel` |
| `parcel_receiver_phone` | text | For parcels only |
| `parcel_description` | text | For parcels only |
| `created_at` | timestamptz | |
| `redeemed_at` | timestamptz | |
| `completed_at` | timestamptz | |

### `trips`

A wrapper for one or more tickets bought together as a single passenger journey. Used by the trip planner to present "Heights to Avondale" as a unit.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid (primary key) | |
| `originating_user_id` | uuid foreign key | |
| `origin_stop_id` | text foreign key | |
| `destination_stop_id` | text foreign key | |
| `selected_option_label` | text | The plan option the user chose |
| `total_fare_usd` | numeric | |
| `total_duration_minutes` | integer | |
| `created_at` | timestamptz | |

### `trip_tickets`

Join table connecting a trip to its tickets in order.

| Column | Type | Notes |
|---|---|---|
| `trip_id` | uuid foreign key | |
| `ticket_id` | uuid foreign key | |
| `sequence` | integer | Leg order |

### `transfers`

Audit log of ticket transfers between users.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid (primary key) | |
| `ticket_id` | uuid foreign key | |
| `from_user_id` | uuid foreign key | |
| `to_user_id` | uuid foreign key | Nullable while the ticket is `transferred_pending` |
| `to_phone` | text | The recipient's phone number when the recipient has no account yet |
| `transferred_at` | timestamptz | |
| `claimed_at` | timestamptz | |

### `kombi_pings`

Telemetry log. The simulation runner appends rows here. The fleet dashboard reads them for the audit.

| Column | Type | Notes |
|---|---|---|
| `id` | bigserial (primary key) | |
| `vehicle_id` | text foreign key | |
| `position` | geography(Point, 4326) | |
| `nearest_stop_id` | text foreign key | Computed at insert time using PostGIS |
| `is_at_stop` | boolean | True if the position is within thirty metres of a stop |
| `recorded_at` | timestamptz | |

### `audit_narratives`

Generated audit reports for fleet owners.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid (primary key) | |
| `vehicle_id` | text foreign key | |
| `for_date` | date | |
| `english_text` | text | Generated by Gemma |
| `shona_text` | text | Generated by Gemma |
| `stops_made` | integer | |
| `digital_fares_logged` | integer | |
| `cash_walkons_logged` | integer | |
| `revenue_gap_estimate_usd` | numeric | |
| `zimra_liability_estimate_usd` | numeric | |
| `generated_at` | timestamptz | |

## Relationships at a glance

```
users (1) ─── (M) tickets ─── (M ticket_id, 1 transfer) ─── transfers
                │
                └── (M trip_tickets, 1) ─── trips

routes (1) ─── (M) route_stops ─── (M) stop_points
       (1) ─── (M) fare_segments
       (1) ─── (M) vehicles ─── (M) kombi_pings

stop_points (M) ─── (M transfer_points) ─── (M) stop_points

vehicles (1) ─── (M) audit_narratives
```

## State machine — ticket

| From | Trigger | To |
|---|---|---|
| (new) | trip planner issues | `issued` |
| `issued` | holder shares the access code | `transferred_pending` |
| `transferred_pending` | recipient claims | `held` |
| `issued` or `held` | conductor enters code on a kombi | `redeemed` |
| `redeemed` | kombi reaches the alight stop | `completed` |
| `issued` or `held` | end of day | `expired` |

The `cash_walkin` status is a parallel branch — created by the conductor's "+1 cash" tap with no `originating_user_id`, and terminates immediately as `completed`.

## Indexes worth creating

- `tickets(access_code)` partial index where `status in ('issued', 'held', 'transferred_pending')` — for fast conductor lookup
- `vehicles(route_id)` — for "kombis on this route" queries
- `kombi_pings(vehicle_id, recorded_at desc)` — for "latest position" queries
- `tickets(originating_user_id, created_at desc)` — for the passenger's ticket history
- A PostGIS GIST index on `stop_points.location` and `routes.polyline`

## Row-level security

For the hackathon, enable row-level security on `tickets`, `transfers`, and `audit_narratives` only. Use the `?as=` persona query parameter to set a Postgres session variable, and write policies that check it. All other tables stay open during the demo to keep the seed loader and the simulation runner simple.

## Seeding

The seed loader reads `seed/network.json` and inserts:
- All four routes
- All stop points (deduplicated by id)
- The route_stops join rows in order
- All fare segments
- All transfer points
- Two seeded vehicles per route
- Pre-loaded user accounts: Takunda ($5 credit), Rudo ($2 credit), Farai (conductor on `ZH 4821`), Baba Tino (fleet owner)
- A small set of seeded historical tickets and pings for the dashboard's first paint

The seed loader is idempotent — running it twice does not duplicate data.
