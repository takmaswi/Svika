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

# **SVIKA: Implementation Roadmap & File Tree Specification**

**Version 1.0 | Principal AI Architect Guidance for AI Agents**

**⚠️ AI AGENT DIRECTIVE:** Read this document carefully before generating any code. This document outlines the exact monorepo structure and the chronological sequence of development. Do not invent folder structures. Do not skip phases. Do not build frontend components until the backend schema for that feature is defined.

## **1\. Environment Variable Contract (.env.local)**

These variables must be defined locally and referenced exactly as shown across the platform.

\# Supabase Backend  
NEXT\_PUBLIC\_SUPABASE\_URL="https://\[YOUR\_PROJECT\].supabase.co"  
NEXT\_PUBLIC\_SUPABASE\_ANON\_KEY="your-anon-key"  
SUPABASE\_SERVICE\_ROLE\_KEY="your-service-key-for-edge-functions"

\# Mapbox WebGL  
NEXT\_PUBLIC\_MAPBOX\_TOKEN="pk.eyJ1..."

\# AI Inference Bridge (Local LM Studio)  
\# Must point to the Cloudflare Tunnel routing to localhost:1234/v1  
LM\_STUDIO\_TUNNEL\_URL="\[https://ai.svika.local/v1\](https://ai.svika.local/v1)"

\# External Integrations  
WHATSAPP\_WEBHOOK\_VERIFY\_TOKEN="your-secure-token"  
WHATSAPP\_API\_BEARER\_TOKEN="your-meta-api-token"  
ECOCASH\_PAYNOW\_INTEGRATION\_ID="your-merchant-id"  
ECOCASH\_PAYNOW\_INTEGRATION\_KEY="your-merchant-key"

## **2\. Monorepo File Tree Specification**

Svika uses a strict monorepo structure to separate the decoupled UIs while sharing Supabase types and utility functions.

svika-monorepo/  
├── package.json (Workspace Root)  
│  
├── apps/  
│   ├── hwindi-pwa/                 \# Next.js App Router (Mobile Web App for Conductors)  
│   │   ├── app/  
│   │   │   ├── globals.css         \# Tailwind v4 directives (Strict Light Mode)  
│   │   │   ├── layout.tsx          \# PWA Manifest & Service Worker registration  
│   │   │   └── page.tsx            \# Main "Fat-Finger" UI & Mapbox Shell  
│   │   ├── components/             \# Zustand-bound UI components  
│   │   ├── lib/  
│   │   │   ├── supabaseClient.ts   \# SWR Fetchers  
│   │   │   └── offlineQueue.ts     \# IndexedDB logic for network drops  
│   │   └── public/  
│   │       └── sw.js               \# Service Worker for offline mode  
│   │  
│   └── fleet-dashboard/            \# Next.js App Router (Desktop UI for Owners)  
│       ├── app/  
│       │   ├── layout.tsx  
│       │   ├── page.tsx            \# Fleet Overview & Ghost Trip Analytics  
│       │   └── vehicles/\[id\]/      \# Specific vehicle telemetry playback  
│       ├── components/  
│       └── lib/  
│  
├── supabase/                       \# The Database Engine & API Layer  
│   ├── config.toml                 \# Supabase local config  
│   ├── migrations/                 \# Strict chronologial SQL definitions  
│   │   ├── 00001\_core\_schema.sql   \# Tables (users, vehicles, trips, tickets)  
│   │   ├── 00002\_postgis\_zones.sql \# pgRouting and Safe Zone polygons  
│   │   ├── 00003\_rls\_policies.sql  \# Security policies  
│   │   └── 00004\_financial\_rpc.sql \# \`purchase\_ticket\`, \`log\_cash\_walk\_in\`  
│   │  
│   └── functions/                  \# Deno Edge Functions  
│       ├── \_shared/                \# Shared TS utilities for Deno  
│       ├── whatsapp-ingest/        \# Webhook: Instantly returns 200 OK, pushes to DB  
│       ├── gemma-worker/           \# Background: Calls LM\_STUDIO\_TUNNEL\_URL  
│       └── payment-webhook/        \# Handles EcoCash/Paynow confirmations  
│  
└── packages/                       \# Shared internal libraries  
    ├── types/                      \# Shared TS definitions (Database definitions)  
    └── ui/                         \# Shared Radix/Tailwind components

## **3\. Chronological Execution Phases**

AI Agents: Execute tasks strictly in this order unless explicitly overridden by the human developer.

### **Phase 1: The Database Foundation (Supabase)**

**Goal:** Establish the strict relational schema, PostGIS routing capabilities, and financial RPCs before any UI is built.

* **Step 1:** Write 00001\_core\_schema.sql (Tables: users, vehicles, routes, trips, tickets, parcels, wallets).  
* **Step 2:** Write 00002\_postgis\_zones.sql (Enable PostGIS, define safe\_zones table, pgRouting setup).  
* **Step 3:** Write 00003\_rls\_policies.sql (Strict Row Level Security for all tables).  
* **Step 4:** Write 00004\_financial\_rpc.sql (Concurrency-safe RPCs using SELECT ... FOR UPDATE for Escrow tickets and cash-walk-ins).

### **Phase 2: The Edge & AI Layer (Deno \+ Gemma)**

**Goal:** Build the omnichannel ingestion pipelines and the local LM Studio bridge.

* **Step 1:** Create whatsapp-ingest Edge Function. Ensure it strictly returns 200 OK instantly and dumps the payload into a Supabase queue to prevent timeouts.  
* **Step 2:** Create gemma-worker Edge Function. Use the standard openai npm package, re-pointing the baseURL to LM\_STUDIO\_TUNNEL\_URL. Parse Shona/English intents into JSON.  
* **Step 3:** Create payment-webhook Edge Function to handle EcoCash top-ups to the "Svika Bucks" wallets.

### **Phase 3: The Hwindi Mobile PWA**

**Goal:** Build the conductor's interface focusing on high-contrast visuals, imperative Mapbox WebGL, and offline resilience.

* **Step 1:** Setup Next.js, Tailwind v4 (Strict Light Theme), and Radix UI primitives.  
* **Step 2:** Build the Mapbox GL JS Shell. Implement the imperative .getSource().setData() pattern for vehicle telemetry (DO NOT USE useState).  
* **Step 3:** Build the "Fat-Finger" UI using Zustand for ephemeral state.  
* **Step 4:** Implement the Service Worker and IndexedDB queue. Ensure offline cash-walk-in taps are saved locally and synced via SWR when the network returns.

### **Phase 4: The Fleet Manager Dashboard & Analytics**

**Goal:** Build the B2B web dashboard for owners to monitor compliance and revenue.

* **Step 1:** Setup the Next.js desktop shell.  
* **Step 2:** Implement SWR data fetching for aggregated revenue data and live active trips.  
* **Step 3:** Build the "Ghost Trip" audit view comparing nightly telemetry against logged ticket revenue.  
* **Step 4:** Implement the consent-based bulk withdrawal UI for liquidating Svika Bucks to corporate bank accounts.