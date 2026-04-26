# Network Data — Svika

## Source

The kombi network for the demo was verified by the user against Google Maps and the Waze live map for Harare. The structured data lives in [`seed/network.json`](../seed/network.json) and is loaded into the database by the seed loader.

The user is the source of truth for all geography. Any future change must be verified the same way — Google Maps plus Waze, with the user confirming the result against lived experience.

## What the demo network covers

Four routes. Three transfer points. Three trip plans. Enough to demonstrate every kind of journey the trip planner needs to handle: a direct mid-route drop, a rank transfer, and a walking-junction transfer.

## Routes

### Route 1 — Mt Pleasant Heights to Rezende Rank

**Identifier:** `route_heights_rezende`

Starts at the Bannockburn Road North Terminus in the Heights area. Heads south on Bannockburn, becoming The Chase, then Second Street (Sam Nujoma Street). Continues south, passing the University of Zimbabwe and the NSSA Building on the right. At Samora Machel Avenue turns right (west). At Julius Nyerere Way turns left (south). At Jason Moyo Avenue turns right (west). The entrance to Rezende Rank is immediately on the right.

Default fare: **$1.50** end to end. Per-segment fares stored separately.

Typical duration: 38 minutes.

Named stops along the route:
1. Bannockburn Rd North Terminus (terminal)
2. University of Zimbabwe Main Gate (mid-route)
3. Second St at Lomagundi Rd Intersection (mid-route — used for the walking transfer)
4. Rezende Rank (terminal, rank)

### Route 2 — Market Square Rank to Avondale Shops

**Identifier:** `route_marketsq_avondale`

Departs Market Square Rank onto Harare Street heading north. Turns left onto Jason Moyo Avenue, then right onto Rotten Row. Turns left onto Samora Machel Avenue West, then right onto Prince Edward Street heading north. Passes Kensington Shops. At Argyle Road turns right, then immediately left onto King George Road to terminate at Avondale Shops.

Default fare: **$1.00** end to end.

Typical duration: 22 minutes.

Named stops:
1. Market Square Rank (terminal, rank)
2. Prince Edward St (Kensington Shops) (mid-route)
3. Prince Edward St at Cork Rd Junction (mid-route)
4. Avondale Shops (terminal)

### Route 3 — Fourth Street Rank to Sam Levy's Village

**Identifier:** `route_fourthst_borrowdale`

Departs Fourth Street Rank heading north. Merges onto Seventh Street, which becomes Borrowdale Road. Continues north on Borrowdale Road, passing the Borrowdale Racecourse on the left. Drop-off is at the layby bus stop on Borrowdale Road just before the main entrance to Sam Levy's Village.

Default fare: **$1.50** end to end.

Typical duration: 25 minutes.

Named stops:
1. Fourth Street Rank (terminal, rank)
2. Sam Levy's Village Bus Stop (terminal)

### Route 4 — Westgate to Copacabana segment (Avondale segment only)

**Identifier:** `route_westgate_copa_segment`

Modelled segment of the inbound Westgate to Copacabana route. From the pickup point near the Lomagundi/King George intersection, heads southwest down King George Road, dropping passengers at Avondale Shops. The full Westgate-Copacabana route extends beyond this segment in both directions; only the Lomagundi-to-Avondale segment is modelled here for the demo.

Default fare: **$0.50** for this short segment.

Typical duration: 5 minutes.

Named stops:
1. King George Rd just off Lomagundi Rd (pickup point — used by the walking transfer)
2. Avondale Shops (terminal — shared identifier with Route 2)

## Transfer points

### Rezende to Fourth Street — rank-to-rank walk

About 750 metres on foot, ten minutes. Walk east across the central business district from Rezende Rank to Fourth Street Rank.

### Rezende to Market Square — rank-to-rank walk

About 1,100 metres on foot, fifteen minutes. Walk west across the central business district between two of the largest ranks.

### Lomagundi walking junction — the tribal-knowledge transfer

About 450 metres on foot, six minutes. Alight from a Heights-to-Rezende kombi at the corner of Second Street and Lomagundi Road. Walk west along Lomagundi Road to the corner of King George Road and Lomagundi Road. Board an inbound Westgate-to-Copacabana kombi from there for the short ride to Avondale.

This transfer is the most important entry in the dataset. It is the kind of knowledge a long-time Harare resident has and a newcomer does not. The trip planner exists to surface it.

## Trip plans

### Heights to Avondale — two options

**Option A: Lomagundi walking transfer (fastest)**
- Heights kombi from Bannockburn to Second/Lomagundi: 20 minutes, $1.00
- Walk west six minutes along Lomagundi Road
- Westgate-Copacabana segment from Lomagundi/King George to Avondale Shops: 5 minutes, $0.50
- Total: 31 minutes, $1.50, 6 minutes walking

**Option B: CBD rank transfer (slowest)**
- Heights kombi from Bannockburn to Rezende: 38 minutes, $1.50
- Walk fifteen minutes west across the CBD to Market Square
- Market Square kombi from Market Square to Avondale Shops: 22 minutes, $1.00
- Total: 75 minutes, $2.50, 15 minutes walking

### Heights to University of Zimbabwe — direct drop

- Heights kombi from Bannockburn to University main gate: 15 minutes, $1.00
- Total: 15 minutes, $1.00, no walking

### Heights to Sam Levy's Village — rank transfer

- Heights kombi from Bannockburn to Rezende: 38 minutes, $1.50
- Walk ten minutes east across the CBD to Fourth Street Rank
- Borrowdale kombi from Fourth Street to Sam Levy's: 25 minutes, $1.50
- Total: 73 minutes, $3.00, 10 minutes walking

## Data hygiene applied to the user's input

When loading the network into the database, two normalisations apply:

1. **Avondale Shops is one stop point.** The original mapping had two identifiers (`sp_avondale_shops` and `sp_avondale_shops_kg`) for the same physical location on different routes. The seed file uses `sp_avondale_shops` consistently and both routes reference the same row in the database.
2. **Fares are per segment.** Each route carries a `default_fare_usd` for the end-to-end ride, plus a `fare_segments` array listing the price for each pair of stops along the route. Trip-plan legs reference these per-segment fares directly. When fuel prices change, only the segment fares need updating.

## Updating the network in the future

Adding a route means adding a row to `routes`, the corresponding stop points to `stop_points`, the join entries to `route_stops`, and the per-segment fares to `fare_segments`. Adding a transfer means adding a row to `transfer_points` connecting two existing stop points. The seed loader handles all of this idempotently.

When the kombi system itself changes — a new corner becomes a transfer point, a route is rerouted because of construction, a fare goes up because of fuel — the data updates without code changes.
