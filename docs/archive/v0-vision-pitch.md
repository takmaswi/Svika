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

# **SVIKA: The National Mobility Operating System**

## *A high-performance, offline-resilient digital ledger and telemetry platform for informal commuter transport.*

## **1\. Executive Summary**

Informal transit (Kombis) moves millions of people and billions of dollars annually in Zimbabwe, yet it operates entirely in the dark. **Svika** is not just a tracking app; it is a full-stack financial, logistical, and smart-city engine designed specifically for the hostile environment of spotty 3G networks and cash-heavy micro-economies.

By leveraging Next.js, Supabase, Google Gemma AI, and Mapbox WebGL, Svika digitizes the physical transit layer, eliminates the friction of physical change, enforces public safety, and formalizes hyper-local parcel logistics—all without forcing passengers to download an app.

## **2\. The Core Problems & The Svika Solutions**

| The Physical Reality (Problem) | The Digital Solution (Svika) |
| ----- | ----- |
| **The Change Problem:** Fights over 50-cent change delay trips. | **Svika Bucks:** A closed-loop digital wallet loaded via EcoCash/InnBucks. Exact fares are deducted instantly via a 3-digit PIN. |
| **The "Ghost Trip" (Shrinkage):** Conductors pocketing fares. | **AI Ledgers:** Nightly telemetry vs. revenue audits flag anomalies. |
| **Kombi Racing & Accidents:** Speeding to capture demand. | **3-Strike Shadow-Bans:** Speeding blinds the driver's demand heatmap and alerts authorities. |
| **The "Drive-By":** Kombis filling up before reaching booked users. | **Escrow Smart-Tickets:** Funds are held in escrow and only released when the passenger boards. |
| **Parcel Theft:** No accountability for sending packages. | **Cryptographic Chain of Custody:** Logistics secured by a dual-OTP handshake and escrow payments. |

## **3\. System Architecture & Tech Stack**

Svika is built on a strict, high-performance tech stack designed to protect low-end Android devices and survive network drops.

* **Framework:** Next.js (App Router, strictly decoupled UIs).  
* **Database & Auth:** Supabase (PostgreSQL, Row Level Security, Edge Functions).  
* **Transactions:** Concurrency-safe PostgreSQL RPCs (Remote Procedure Calls).  
* **State Management:** SWR (Server state) & Zustand (Visual UI state only).  
* **Mapping:** Mapbox GL JS (Imperative WebGL rendering bypassing React state).  
* **AI Engine:** Google Gemma (Parsing WhatsApp NLP text/audio intents).  
* **Design Language:** Pristine, ultra-high-contrast **Light Mode** (white/black/vibrant accents) optimized for harsh outdoor sunlight readability.  
* **Offline Resilience:** Service Workers & IndexedDB queue hwindi inputs when the network drops, syncing instantly upon reconnection.

## **4\. User Interfaces & Access Layers**

To minimize bundle size and maximize adoption, Svika uses distinct interfaces for different stakeholders:

1. **Passengers (WhatsApp & USSD):** Zero downloads. Users book rides, top up Svika Bucks, and view fixed-route intercept maps entirely via WhatsApp bots or USSD \*123\# menus.  
2. **Hwindis (Next.js Mobile PWA):** A lightweight, "fat-finger" interface. Features giant buttons for analog cash entries, a PIN-pad for digital boardings, and a Mapbox demand heatmap.  
3. **Fleet Managers (Next.js Desktop):** A SaaS dashboard for revenue tracking, real-time fleet telemetry, and manual consent-based liquidity withdrawals.  
4. **Government/City Planners (B2G Dashboard):** Aggregated PostGIS spatial data showing macro mobility flows, compliance certificates, and speeding infractions.

## **5\. Flow Charts (System Logic)**

### **A. The Passenger Booking & Escrow Flow**

sequenceDiagram  
    participant User (WhatsApp)  
    participant Svika Engine (Supabase)  
    participant Hwindi (PWA)  
      
    User (WhatsApp)-\>\>Svika Engine: "Heights to Avondale"  
    Svika Engine--\>\>User (WhatsApp): Sends Intercept Map & Route. Price: $1.50  
    User (WhatsApp)-\>\>Svika Engine: Confirms Booking  
    Svika Engine-\>\>Svika Engine: Deduct $1.50 from Svika Bucks \-\> Lock in Escrow  
    Svika Engine--\>\>User (WhatsApp): Issues 3-Digit PIN (e.g. 482\)  
    Note over User (WhatsApp),Hwindi (PWA): Passenger walks to Intercept Safe Zone  
    User (WhatsApp)-\>\>Hwindi (PWA): Boards Kombi, shouts PIN "482"  
    Hwindi (PWA)-\>\>Svika Engine: Types "482" into PIN Pad  
    Svika Engine-\>\>Svika Engine: Matches PIN to Escrow  
    Svika Engine--\>\>Hwindi (PWA): Release $1.50 to Vehicle Wallet. Occupancy \+1

### **B. The Secure Parcel Delivery Flow (Node-to-Node)**

*Disclaimer: High-value items are sent at the user's own risk.*

sequenceDiagram  
    participant Sender  
    participant Svika Escrow  
    participant Hwindi  
    participant Receiver

    Sender-\>\>Svika Escrow: Books Delivery (e.g. Rank to Safe Zone). Pays $3.  
    Svika Escrow--\>\>Sender: Generates Custody OTP-A & Release OTP-B  
    Sender-\>\>Receiver: Texts Release OTP-B to Receiver  
    Sender-\>\>Hwindi: Hands over Parcel \+ Custody OTP-A  
    Hwindi-\>\>Svika Escrow: Inputs OTP-A (Accepts Liability)  
    Note over Hwindi: Kombi drives fixed route to Destination Safe Zone  
    Receiver-\>\>Hwindi: Meets Kombi, provides Release OTP-B  
    Hwindi-\>\>Svika Escrow: Inputs OTP-B  
    Svika Escrow--\>\>Hwindi: Unlocks $3.00 to Vehicle Wallet. Liability cleared.

### **C. The 3-Strike Safety & Compliance Engine**

graph TD  
    A\[Supabase Telemetry RPC\] \--\>|Calculates Velocity| B{Speed Limit Exceeded?}  
    B \--\>|No| C\[Normal Operations\]  
    B \--\>|Yes| D\[Log Speeding Infraction\]  
    D \--\> E{Strike Count?}  
    E \--\>|Strike 1| F\[Audio Warning \+ Blind Demand Heatmap for 15 mins\]  
    E \--\>|Strike 2| G\[WhatsApp Alert to Fleet Manager\]  
    E \--\>|Strike 3| H\[Revoke Safe Zone Commissions \+ Alert Transport Authority\]

## **6\. Value Proposition by Stakeholder**

* **1\. The Passenger:**  
  * No more fighting for change (Svika Bucks).  
  * Multi-hop dynamic routing (avoiding full Kombis).  
  * Emergency safety (ICE Digital Manifest shared with MARS in an accident).  
* **2\. The Hwindi (Conductor):**  
  * Frictionless digital boardings (3-digit PIN).  
  * Instant consent-based cash-out via InnBucks/EcoCash or physical cash from "Rank Merchants."  
* **3\. The Fleet Manager:**  
  * Total visibility into daily revenue (stopping conductor shrinkage).  
  * Automated generation of B2G Compliance Certificates for tax benefits.  
  * Consent-based bulk withdrawals to corporate bank accounts.  
* **4\. ZIMRA (Zimbabwe Revenue Authority):** \* An immutable, digital ledger of previously untraceable cash economies, allowing for fair, data-backed taxation.  
* **5\. ESG & Transport Authorities (City Council):** \* Aggregated PostGIS data (Urban Mobility Dashboard) to design better roads, bus lanes, and infrastructure based on actual human flow, not guesswork.  
* **6\. First Responders (Medical/Police):** \* Instant access to a digital manifest (Blood Type, Next of Kin, Medical Aid) when a Kombi's telemetry detects a violent crash.

## **7\. The Revenue Model (How Svika Makes Money)**

Svika utilizes a diversified, highly scalable monetization strategy:

1. **Freemium & Digital Ads (B2C):** The free tier monetizes passengers by serving targeted localized ads on the Web Intercept Maps (Live Radar links) while maintaining strict WhatsApp Business API compliance.  
2. **Passenger Subscriptions (B2C):**  
   * **$1.00/month:** Ad-free premium experience.  
   * **$2.00/month:** Ad-free experience \+ Unlimited Smart Multi-Hop Routing (Critical Path access).  
3. **Fleet Analytics Subscriptions (B2B SaaS):** Fleet owners pay **$5.00/month per registered Kombi** for premium access to the Desktop Dashboard, unlocking Ghost Trip Audits, Telemetry playbacks, and automated Digital Ledgers.  
4. **Last-Mile Logistics API (B2B):** Formal delivery companies (e.g., fast food, local couriers) pay a subscription or volume-based API fee to plug into Svika's network, utilizing Kombis for secure, last-mile parcel routing.  
5. **Platform Fees (The Escrow Cut):** Svika takes a micro-percentage (e.g., 1-2%) on physical cash-outs via Rank Merchants and on high-value parcel logistics transactions processed through the Escrow engine.  
6. **Urban Mobility Dashboard (B2G/Enterprise):** Subscription access for city planners and consulting firms to view macro-level heatmap data and transit flow analytics.

*Document Generated by Svika Principal AI Architect for Hackathon Pitch & Development Kickoff.*

