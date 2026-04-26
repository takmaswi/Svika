# Pitch Deck Outline — Svika

Eight slides. Designed to support the three-minute video, not duplicate it. Every slide carries the Mosi-oa-Tunya palette: deep teal `#0A4B5C` primary, sunset rust `#D9622A` accent, pale stone `#F2EDE6` background, Geist typeface.

## Slide 1 — Title

**Visual:** Wordmark *Svika* in deep teal on the pale stone background. Below it, a quiet line of text.

**Words:**
> *Svika*
>
> Digital tickets, real revenue, same kombi.
>
> Built for Harare. GDG Harare Build with AI Hackathon 2026.

**Notes:** No images. The wordmark and the line do the work. Author and contact in small type at the bottom.

## Slide 2 — The pain

**Visual:** Three short bullets, each with one Zimbabwean-specific number or quote that grounds the problem. No stock photos.

**Words:**
> *Zimbabwe moves on kombis.*
>
> - Billions of dollars a year. No receipts. No tax trail.
> - Fares change with fuel. Every change is an argument.
> - Every visitor needs a local to plan a trip across town.
>
> *We chose to digitise the network we have, not replace it.*

**Notes:** This slide sets up the "switch" pillar of the hackathon — local product for local pain.

## Slide 3 — The solution in one sentence

**Visual:** A single sentence centred on the slide. Below it, a one-line subtitle.

**Words:**
> *Svika is a digital ticket and trip-planning system for Harare's informal kombi network.*
>
> Transferable tickets. Walking-transfer trip planning. Real revenue dashboards. Same kombi, same hwindi, same fare.

**Notes:** Memorise this sentence. Use it verbatim in any conversation about the project.

## Slide 4 — The demo

**Visual:** A still frame from the three-minute video — the moment the bilingual Gemma audit narrative appears on the fleet dashboard. A play button overlay. URL below.

**Words:**
> *Three-minute demo.*
>
> svika.vercel.app
>
> [video link]

**Notes:** During the live pitch, this is the slide that plays the video. Judges already saw it but it anchors the rest of the conversation.

## Slide 5 — How it is built

**Visual:** A clean version of the system architecture diagram from `docs/diagrams/system-architecture.mmd`, rendered for slide aesthetics. Logos for the four named technologies.

**Words:**
> *One Next.js app. Four surfaces. Supabase for data. Mapbox for maps. Gemma 4 E2B running on-device for Shona understanding and bilingual audit narratives.*
>
> Free tiers throughout. Zero ongoing infrastructure cost.

**Notes:** This slide is for the 20% Google-tools score. Lead with Gemma. The "on-device, private inference" framing is the hackathon's published language for Gemma — use it.

## Slide 6 — What is solved today and what is not

**Visual:** A two-column table. Left column: what is built and working. Right column: what is roadmap.

**Words:**
> **Working today**
> - Trip planning with walking transfers
> - Transferable digital tickets
> - Conductor PIN flow plus cash walk-on
> - Live kombi positions
> - Bilingual revenue audit
> - Estimated ZIMRA liability
> - WhatsApp-style companion
> - Same-kombi parcel happy path
>
> **Roadmap**
> - Carrier menu access (*123#)
> - Real EcoCash top-ups
> - Speeding engine
> - Emergency manifest
> - Real WhatsApp Business
> - City planning data
> - ZUPCO ticket interoperability

**Notes:** Honesty wins points. The split shows we can ship a real thing AND see further.

## Slide 7 — Why now and why us

**Visual:** Three short paragraphs.

**Words:**
> *Why now.* On-device language models like Gemma 4 E2B make local-language artificial intelligence affordable for the first time. Mapbox and Supabase give a single developer the infrastructure of a small company. The change to digitise this layer is technically possible today.
>
> *Why this approach.* The kombi network does not need disruption — it works. It needs visibility, trust, and a digital signal so price changes stop being arguments. Svika sits over the existing system without replacing it.
>
> *Why us.* Built by a Zimbabwean developer for the city the developer actually lives in. Every street name, every transfer corner, every fare in this product has been verified against the lived experience of Harare residents.

**Notes:** This slide is the "founder fit" slide. Local credibility is the project's largest moat.

## Slide 8 — The ask

**Visual:** A single call to action. Contact details. Repository link.

**Words:**
> *We are looking for: a fleet of two to four kombis to pilot the system, an introduction to ZUPCO operations, and feedback from any Harare commuter who has ever lost time arguing about change.*
>
> svika.vercel.app
> github.com/[username]/svika
> takmaswi@gmail.com

**Notes:** A specific ask is more memorable than a generic "we are hiring." Two to four kombis is concrete. Introductions to ZUPCO are concrete. Commuter feedback is concrete.

## Visual style notes

- All slides use the same brand palette and typography. No mixed fonts.
- Charts and tables, where present, use the brand teal and accent rust. No third colour.
- No clipart. No stock photos of African cities. No drone shots of Harare. The product itself is the visual.
- Line spacing generous. Words sparse. Each slide should be readable from across a room in three seconds.

## Export

Final deck as a PDF named `svika-pitch.pdf` at the project root or under `docs/pitch/`. Submit alongside the video link.
