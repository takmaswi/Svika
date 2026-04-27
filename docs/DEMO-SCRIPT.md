# Demo Script — three-minute Svika video

## Total length

Three minutes. Two minutes forty seconds of working product. Twenty seconds of roadmap tail.

## Tone and style

Direct. Local. No hype words. Voiceover in plain English. Shona phrases appear on screen and in the artificial-intelligence narrative.

## Cast

There is one user. The story follows him end to end. The other characters appear as inserts, screenshots, and propagated effects on his screen — never as persona switches the viewer has to follow.

| Character | Role | How they appear |
|---|---|---|
| **Takunda** | Hero passenger — the only person who navigates the app on camera | Phone, mobile-first web on `/?as=takunda` |
| Rudo | Takunda's cousin, transfer recipient | A still recipient screenshot when Takunda shares a ticket; never reached by switching personas |
| Farai | Conductor on kombi `ZH 4821` | Cutaway insert from `/hwindi?as=farai` for two seconds; appears by name on Takunda's journey card and in the "Fare cleared" toast |
| Baba Tino | Fleet owner | Cutaway insert from `/fleet?as=baba_tino`; the fleet-impact mini-card surfaces inside Takunda's arrived sheet |

## Cold open — 0:00 to 0:20 — the pain

Visuals: a single still or short clip of a real Harare kombi rank with the audio of an argument about change. No text. A pale-stone background fades over the visual. White text fades up:

> *"Zimbabwe moves on kombis."*
>
> *"Billions of dollars a year. No receipts. No tax trail. No way to plan a trip you have not done before. No proof of payment. And every time fuel goes up, an argument."*

End the cold open on a Mosi-oa-Tunya teal title card: **Svika**.

## Scene 1 — 0:20 to 0:55 — Takunda plans the trip

Visuals: phone screen recording of `/?as=takunda`. The brand-teal landing card has already filled the gap — Takunda is past the front door. The empty-state hero greets him by name: *"Where to, Takunda?"* The map underneath shows the four kombi routes faintly, with kombi markers — top-down rasterised SVGs of a Toyota Hiace, rotated to follow each route's bearing — moving smoothly in real time.

On-screen action:
- Takunda taps the search bar.
- He types or dictates: *"Ndirikuda kuenda Avondale, ndiri kuMt Pleasant Heights"* — Shona for "I want to go to Avondale from Mt Pleasant Heights."
- A small banner appears: *"Understood by Gemini 2.5 Flash."* (Gemma 4 E2B remains on the laptop for the audit narrative; Gemini handles the interactive Shona understanding because Gemma's CPU latency is too slow on this hardware.)
- Two trip cards slide up: the Lomagundi walking transfer (31 minutes, $1.50) and the CBD rank transfer (75 minutes, $2.50). Each card shows the route highlighted on the underlying map.
- A short bilingual line under each card explains the trade-off.

Voiceover:
> *"Takunda is at Mt Pleasant Heights. He is going to Avondale. There is no kombi that goes there directly. The trip planner knows two ways — a tribal-knowledge walking transfer at Lomagundi corner, or the slow ride into the city and back out."*

## Scene 2 — 0:55 to 1:20 — Takunda buys two tickets and shares the first

He picks the walking-transfer plan. A glass payment-choice sheet rises:

> *Pay $1.50 from wallet · you have $5.00*
>
> *Pay $1.50 cash on board · 0 of 15 seats today*

He taps wallet. Two tickets land in his wallet drawer:

- Ticket **482** — Heights kombi, valid for boarding at Bannockburn, alighting at Second/Lomagundi.
- Ticket **619** — King George kombi, valid for boarding at Lomagundi/King George, alighting at Avondale Shops.

The second ticket is dimmed with a small label: *"Activates after Leg 1."*

A short beat — Takunda realises his cousin Rudo needs the ticket more than he does. He taps **Share / transfer** on the spare ticket and picks Rudo. The system share sheet opens; cut briefly to a still **screenshot inset** of a WhatsApp message landing on Rudo's phone with the claim link `/?as=rudo&claim=<id>`. We do not switch personas on screen.

Voiceover:
> *"Two access codes. One trip. Paid up front, deductible from his wallet. And tickets transfer — Takunda just sent a spare to his cousin Rudo over WhatsApp. Same code, different person, no cash, no change, no fight."*

## Scene 3 — 1:20 to 1:45 — Takunda boards, the fare clears on his screen

Takunda walks up to the kombi at the Bannockburn stop. The journey card at the bottom of his screen shows the Uber-style driver chip — *Farai · Conductor · ZH 4821 · Toyota Hiace · cream* — and the live "Arriving in 2 min" rust readout.

Cut briefly to a **conductor cutaway insert** — Farai's `/hwindi` keypad fills the corner of the frame for two seconds — Farai taps *4*, *8*, *2*, confirm. We never leave Takunda's narrative; the insert is a side card, not a navigation.

We return to Takunda's phone. A glass toast slides in from the top of his screen:

> **Fare cleared by Farai · ZH 4821 · seat 9 of 15**

The toast auto-dismisses after four seconds. The journey card flips to *"On your way to Second St at Lomagundi Rd Intersection"* and the rust readout switches to *"Arriving in 10 min."*

Voiceover:
> *"Takunda does not switch screens. He does not refresh anything. The conductor's keypad on the other side of the kombi door reaches his phone in real time."*

## Scene 4 — 1:45 to 2:10 — the walking transfer and the second leg

The map zooms into the Lomagundi corner. The dashed walking polyline appears between the two stops, and the journey card swaps to the cardinal-arrow icon and reads:

> *Walk west on Lomagundi Road*
> *From: Second St at Lomagundi Rd Intersection (just alighted)*
> *To: King George Rd just off Lomagundi Rd (board next)*
> *6 min · 480 m*

He boards the second kombi. The same toast pattern fires again — *"Fare cleared by Farai · ZH 5101 · seat 7 of 15"* — and the journey card flips to *"On your way to Avondale Shops (King George Rd)"*.

Voiceover:
> *"Six minutes of walking. One transfer. Both fares paid up front, both cleared digitally. Avondale, in half the time of the alternative."*

## Scene 5 — 2:10 to 2:45 — Avondale, and where the money landed

The map fits the trip and eases back to the network bounds. The journey card collapses into a small *"You've arrived · 31 min · $1.50"* summary.

Underneath the arrival line, a quiet new row appears:

> *"Your $1.50 just landed in Baba Tino's ledger ›"*

Takunda taps the disclosure. The mini-card expands inline:

> **$34.00 today · 19 digital fares · 8 cash boardings**
> See full fleet dashboard →

Cut briefly to a **fleet cutaway insert** — `/fleet?as=baba_tino` opens in a small picture-in-picture corner showing the **Ghost Trip audit** card with bilingual text generated by Gemma:

**English:**
> *"ZH 4821 stopped 41 times along the Mt Pleasant–Rezende route today. 31 of those stops resulted in a logged fare. The remaining 10 stops show no fare entry. At average route fares, this represents an estimated revenue gap of $10.00. Most unlogged stops occurred between 14:00 and 16:00 along Second Street."*

**Shona:**
> *"Nhasi kombi ZH 4821 yakamira ka41 panzira yeMt Pleasant kuRezende. 31 chete pakati pekumira uku ndipo pakanyorwa mari. 10 hapana mari yakaiswa. Pamutengo wedhora rimwe pamvura, pane mari yakashaikwa inosvika madhora gumi. Kushaikwa uku kwakawanda pakati pe2 ne4 zuva, panzira yeSecond Street."*

A small card: *"Estimated ZIMRA liability this month: $74.50."*

Voiceover:
> *"This is the first time anyone has shown Baba Tino where his money goes. In English for the bank. In Shona for his mother. And Takunda did not have to leave his arrival screen to know his fare landed there."*

## Scene 6 — 2:45 to 3:00 — the close and the roadmap tail

The screen returns to the brand teal. Wordmark **Svika**. A short title:

> *"Digital tickets. Real revenue. Same kombi."*

Then a fast roadmap reel — twenty seconds of quick visual flashes labelled clearly with a small "Roadmap" badge in the corner:

- Carrier menu mock — *"For phones without data."*
- A red speeding-warning banner — *"Driver safety enforcement."*
- An emergency contacts card on a phone — *"First responder access."*
- A city density heatmap — *"Urban planning data."*
- A WhatsApp Business handle — *"Real WhatsApp integration."*

End on a final card with the URL `svika.vercel.app` and the GitHub link.

Voiceover for the tail:
> *"This is the first version. Carrier menu access, driver safety, emergency manifest, planning data — these are next."*

## The three real moments

If anyone forgets the rest of the script, hold these three moments. Each is built and working in code; each shows a problem the network has had for decades getting solved.

1. **The Shona-to-trip-plan moment** (Scene 1) — local-language understanding into a real walking-transfer plan, on a network the city has never seen on a map.
2. **The "fare cleared" moment** (Scene 3) — the conductor's keypad, on the other side of the kombi door, reaches the passenger's phone in real time.
3. **The fleet-impact moment** (Scene 5) — the passenger sees where his fare landed and that the system can already tell Baba Tino where the gaps are, in two languages.

## Capture method

| Scene | Method |
|---|---|
| Cold open | Stills or stock footage with overlaid text |
| Scenes 1–6 | Live screen recording at 60 frames per second on a real device, fullscreen |
| Walking transfer animation | Real footage or a short After Effects animation over the live map |
| Roadmap tail | Slide compositions with subtle animation |

## Rules during recording

- No real EcoCash, no real WhatsApp, no real money. The seed data covers everything.
- The artificial-intelligence calls are real — `understand` runs through Gemini 2.5 Flash; the audit narrative is warmed locally via Gemma 4 E2B and read from the `audit_narratives` cache in prod.
- The kombi simulation runner is started before recording so the markers move and the eased per-vehicle interpolation is visible.
- Every screen carries the persona query parameter so navigation between surfaces is fluid.
- Audio is recorded separately and dubbed over the screen recording.

## What goes in the README

The README in the GitHub repository must mirror this script's tier labels. Each feature shown in the video must appear in the README under one of three sections: *Built and working*, *Demonstrated with stubbed backend*, or *Roadmap*. No feature in the video may be missing from the README.
