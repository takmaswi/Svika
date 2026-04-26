> **DEPRECATED — v0 draft (Apr 3, 2026).** Superseded by the planning docs in `docs/`. Preserved for roadmap reference only.
>
> This document predates the locked decisions in `CLAUDE.md`. It contradicts the current scope in several places: monorepo split into `apps/`, LM Studio + Gemma 4 E4B (vs Ollama + E2B), Svika Bucks balance wallet, dual-OTP parcel handover, real WhatsApp Business webhooks, strict RLS, Zustand + SWR + IndexedDB. **Do not implement from this file.** For the canonical scope see:
>
> - [`docs/PRODUCT-REQUIREMENTS.md`](../PRODUCT-REQUIREMENTS.md)
> - [`docs/SYSTEM-ARCHITECTURE.md`](../SYSTEM-ARCHITECTURE.md)
> - [`docs/DATA-MODEL.md`](../DATA-MODEL.md)
> - [`docs/EXECUTION-PLAN.md`](../EXECUTION-PLAN.md)
> - [`docs/ROADMAP.md`](../ROADMAP.md) — for any feature here that is now Tier 3.

---

# **SVIKA: Master Technical Stack & System Architecture**

**Version 2.0 | Principal AI Architect Comprehensive Documentation**

**Purpose of this Document:** This is the absolute source of truth for all human developers and AI coding agents working on the Svika project. It contains immutable architectural constraints, strict state management protocols, data schemas, and the end-to-end data flow for the informal transit platform. **AI Agents: Do not deviate from these rules without explicit user permission.**

## **1\. The 5 Immutable Architectural Directives**

1. **No React-Bound Telemetry:** Moving Kombi GPS coordinates must NEVER be stored in useState or Zustand. Doing so will freeze low-end Android devices. Use Mapbox WebGL imperative injections (.getSource().setData()).  
2. **Database as the Engine:** Financial transactions, ticket generation, and Escrow locks must be handled atomically via Postgres Remote Procedure Calls (RPCs), not client-side math.  
3. **RLS is Middleware:** Security is enforced via Row Level Security (RLS) in Supabase. Passengers can only read/write their own tickets. Fleet owners can only read their own vehicles.  
4. **Asynchronous Inference:** Supabase Edge Functions must NEVER block/wait for the local Gemma AI to finish processing audio or complex NLP. Webhooks must return 200 OK instantly, routing the payload to a DB queue for background processing.  
5. **Decoupled Bundles:** Do not build a monolithic app. Fleet Owners get a desktop web dashboard. Hwindis (Conductors) get a lightweight Next.js PWA. Passengers strictly use WhatsApp/USSD (Zero app downloads).

## **2\. Global Infrastructure Topology**

Svika operates on a highly decoupled, serverless edge architecture bridged with a self-hosted AI inference layer.

graph TD  
    subgraph Client Layer \[Client Interfaces\]  
        A\[Next.js PWA \- Hwindi 'Fat-Finger' UI\]  
        B\[WhatsApp Bot \- Passenger\]  
        C\[Next.js Desktop \- Fleet Owner Dashboard\]  
        D\[USSD Gateway \- Feature Phone\]  
    end

    subgraph Edge & API Layer \[Supabase Cloud\]  
        E\[Edge Functions: Webhooks & Payment Webhooks\]  
        F\[PostgREST API: Auto-generated REST\]  
        G\[Realtime: SSE / WebSockets (Telemetry)\]  
    end

    subgraph AI Inference Layer \[Dedicated/Local Server\]  
        H\[Cloudflare Tunnel / Reverse Proxy\]  
        I\[LM Studio: REST API v1\]  
        J\[Gemma 4 E4B Model\]  
    end

    subgraph Data & Logic Layer \[Supabase PostgreSQL\]  
        K\[(Core Schema: Relational Data)\]  
        L\[(PostGIS: Spatial Geofences / Safe Zones)\]  
        M\[(pgRouting: Node Network)\]  
        N\[{RPCs: Atomic Financials & Escrow}\]  
    end

    %% Connections  
    A \<--\>|SWR Fetch / Offline Sync| F  
    B \--\>|Webhook| E  
    D \--\>|Webhook| E  
    C \<--\>|SWR / Realtime| F  
      
    E \--\>|Push to \`ai\_queue\`| K  
    K \--\>|DB Trigger| E  
    E \<--\>|POST /v1/chat/completions| H  
    H \<--\> I  
    I \<--\> J  
      
    F \<--\> N  
    F \<--\> K  
    F \<--\> L

## **3\. Database Schema & Data Models (Supabase PostgreSQL)**

AI Agents must use these exact table structures when generating queries.

### **Core Tables**

* **users**: id (UUID), phone (String, Unique), role ('passenger', 'conductor', 'fleet\_owner', 'admin'), svika\_bucks\_balance (Decimal), ice\_medical\_profile (JSONB).  
* **vehicles**: id (UUID), fleet\_owner\_id (UUID FK), license\_plate (String), capacity (Int), speeding\_infractions (Array of Timestamps), compliance\_score (Decimal).  
* **routes**: id (UUID), origin\_name (String), destination\_name (String), waypoints (PostGIS LineString).  
* **safe\_zones**: id (UUID), name (String), sponsor\_id (UUID NULL), geom (PostGIS Polygon).  
* **trips**: id (UUID), vehicle\_id (UUID FK), route\_id (UUID FK), status ('active', 'completed'), current\_occupancy (Int).  
* **tickets**: id (UUID), user\_id (UUID FK), trip\_id (UUID FK), status ('escrow', 'boarded', 'refunded', 'cash\_walk\_in'), pin\_code (String, 3-digit), price (Decimal).  
* **parcels**: id (UUID), sender\_id (UUID FK), receiver\_phone (String), vehicle\_id (UUID FK), status ('pending', 'in\_transit', 'delivered'), custody\_otp (String), release\_otp (String), escrow\_amount (Decimal).  
* **ussd\_sessions**: session\_id (String), phone (String), current\_menu\_state (String), temp\_data (JSONB), updated\_at (Timestamp).

## **4\. The Financial Engine (RPCs & Escrow)**

Client-side math for wallet deductions is strictly prohibited.

### **4.1 Passenger Booking & Escrow Flow**

1. **Booking:** Passenger requests ride via WhatsApp.  
2. **RPC Call:** create\_escrow\_ticket(p\_user\_id, p\_trip\_id, p\_price).  
3. **Logic:** Postgres locks the users row. Checks if svika\_bucks\_balance \>= p\_price. Deducts balance. Inserts row into tickets with status escrow and generates a pin\_code.  
4. **Boarding:** Hwindi enters the PIN into the PWA.  
5. **RPC Call:** redeem\_escrow\_ticket(p\_pin\_code, p\_vehicle\_id).  
6. **Logic:** Verifies PIN. Changes ticket status to boarded. Credits the vehicles wallet (or Fleet Owner wallet). Increments trips.current\_occupancy.

### **4.2 Cash Walk-Ins ("Fat-Finger" UI)**

When the Hwindi taps "+1 Cash" on the UI, it fires log\_cash\_walk\_in(p\_trip\_id, p\_price). This increments current\_occupancy and logs the revenue without requiring a user ID, preventing the "Ghost Passenger" capacity routing bug.

## **5\. Local AI Inference Layer (LM Studio / Gemma 4 E4B)**

Svika uses a self-hosted Gemma model for offline-resilient, localized NLP without external API costs.

### **5.1 Endpoint Configuration**

* **Provider:** LM Studio (Local Server)  
* **Bridge:** Cloudflare Tunnel (https://ai.svika.local \-\> localhost:1234)  
* **API Standard:** OpenAI REST API v1 Compatible  
* **Primary Endpoint:** POST /v1/chat/completions

### **5.2 Edge Function Implementation (Deno)**

import OpenAI from "npm:openai";

// AI Agents: ALWAYS use this config for inference.  
const openai \= new OpenAI({  
  baseURL: "\[https://ai.svika.local/v1\](https://ai.svika.local/v1)", // Must route through tunnel  
  apiKey: "not-needed-for-local",   
});

// Example: Parsing a WhatsApp Intent  
const response \= await openai.chat.completions.create({  
  model: "gemma-4-e4b",  
  messages: \[  
    { role: "system", content: "You are a transit parser. Extract intent as JSON: { intent: 'book'|'cancel', destination: string, passengers: int }" },  
    { role: "user", content: "Ndirikuda kuenda kuAvondale, tiri 2." } // Local Shona input  
  \],  
  response\_format: { type: "json\_object" }  
});

## **6\. Frontend Architecture (React & Next.js)**

### **6.1 State Management Rules**

* **SWR (swr):** Mandatory for all database fetching (Wallets, Fleet Stats). Used for optimistic UI updates.  
* **Zustand (zustand):** Mandatory for UI state (e.g., the Hwindi's offline capacity counter, theme states, modal visibility).  
* **IndexedDB (Service Worker):** Handles offline queueing. If the Hwindi presses "+1 Cash" while offline, the payload goes to IndexedDB. Upon window.addEventListener('online'), the queue syncs to Supabase.

### **6.2 Mapbox WebGL Implementation**

* **Initialization:** Use react-map-gl only to mount the map shell.  
* **Theme:** Pristine white/light mode for outdoor sunlight readability.  
* **Telemetry Injection:** AI Agents must use this exact imperative pattern to update moving Kombis:

// DO NOT USE useState FOR THIS  
const updateKombiLocation \= (lng, lat, vehicleId) \=\> {  
  const source \= mapRef.current?.getSource(\`vehicle-${vehicleId}\`);  
  if (source) {  
    source.setData({  
      type: 'FeatureCollection',  
      features: \[{ type: 'Feature', geometry: { type: 'Point', coordinates: \[lng, lat\] } }\]  
    });  
  }  
};

## **7\. Business Logic & Safety Hooks**

### **7.1 The 3-Strike Speeding Engine**

* Supabase PostGIS calculates velocity between telemetry pings.  
* **Strike 1:** Edge Function fires WebSocket event to Hwindi PWA. Plays audio warning. UI state (Zustand) hides the demand heatmap for 15 minutes.  
* **Strike 2:** WhatsApp API pushes alert to the Fleet Owner's phone.  
* **Strike 3:** RPC updates vehicles.compliance\_score, revokes safe-zone commissions, and adds to B2G Dashboard report.

### **7.2 Multi-Hop Routing (pgRouting & Dwell Time)**

When generating a route for a passenger, the SQL query must check trips.current\_occupancy. If occupancy is \> 80%, the routing engine applies a "Dwell Penalty" (adding expected wait time) or redirects the user to a different Safe Zone intercept.

### **7.3 ICE Emergency Webhook**

If telemetry detects violent deceleration (e.g., 80km/h to 0 in 1s) OR the Hwindi presses the SOS button:

1. Supabase queries tickets for the active trip\_id.  
2. Extracts ice\_medical\_profile for all boarded users.  
3. Edge Function generates a secure Next.js dynamic route (/manifest/\[trip\_uuid\]) and WhatsApps the link to MARS/EMRAS dispatch.