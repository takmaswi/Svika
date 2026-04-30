# Svika, context for AI video tooling

## What Svika is

Svika is a digital ticketing and trip-planning system for Harare's informal kombi (minibus) network. It is a hackathon submission for the GDG Harare Build with AI 2026 hackathon.

## The pitch in one sentence

In Zimbabwe, riding a kombi means asking a stranger which one to take, waiting blind for it to arrive, and fighting over change when it does. Svika fixes all three.

## Who it serves

A working professional in Harare who rides kombis several times a week. They speak Shona and English. They have a smartphone with intermittent data. They want to know which kombi to take, when it will arrive, and what they will pay, without arguing.

## What the video has to do

Three minutes total. Punchy and confident tone. Linear-style restraint, not Pixar excess.

- 0:00 to 0:08: Three quick text frames naming the three pains.
- 0:08 to 0:14: Brand reveal, the wordmark on Bone background.
- 0:14 to 1:45: Animated walkthrough of the rider experience: location-first onboarding, Shona trip planning, fare-cleared toast, fleet impact disclosure.
- 1:45 to 2:00: Fleet owner sees the bilingual revenue audit produced on-device by Gemma.
- 2:00 to 3:00: Static walkthrough of the live app surfaces (real screenshots, narrated).
- Last 5 seconds: Roadmap close, the URL, the GitHub link.

## Brand language

Colors:
- Forest   #1F4D2E   primary CTA, primary ink, primary surface
- Pine     #0E3A1E   pressed states
- Char     #0E1A12   body copy
- Bone     #FFFCEF   page background, light surface
- Linen    #E9E2C8   muted surface
- Signal   #E84C30   accent, key verbs, live indicator
- Moss     #4D5C44   muted text

Typography:
- Display: DM Sans 700, used for headlines and the wordmark voice
- Body:    IBM Plex Sans, used for paragraphs and UI text
- Mono:    IBM Plex Mono, used for codes, fares, timestamps

All three typefaces are SIL OFL 1.1 licensed.

## Voice direction

The narrator is the founder, a Zimbabwean working professional. Calm, confident, plain English with the occasional Shona phrase. Not corporate, not breathless. Reads like someone who actually rides kombis and built the thing because the friction bugged them every day.

## Google AI tools used (the 20 percent Google pillar)

- Gemini 2.5 Flash: live Shona and English trip understanding inside the app.
- Gemma 4 E2B running on-device via Ollama: bilingual revenue audit narrative on the fleet dashboard.
- Gemini Deep Research: planning research while drafting the product requirements document.
- Custom Gemini Gem: context container during PRD authoring.
- Google AI Studio + Google Maps: trip route data extraction (rendered via Mapbox in product).
- Google Antigravity: agentic IDE used to write and refactor the TypeScript codebase.
- Google NotebookLM Cinematic Video Overview (Gemini + Imagen + Veo): this submission video.

## Real moments to land in the video

1. Speaking Shona to get a trip plan. The app understands the language. The plan includes a walking transfer locals know but visitors never figure out.
2. The fare-cleared toast. The conductor enters the rider's three-digit code on a separate screen; the rider's phone receives the confirmation in real time.
3. The fleet impact card. The rider arrives and a quiet line tells them where their fare landed. They tap, and the bilingual Gemma audit narrative appears on the fleet dashboard, in Shona for home and English for the bank.

## What NOT to show

- Real EcoCash, Paynow, or any money movement (top-ups are mocked).
- Real WhatsApp Business or USSD aggregator (those surfaces are mocked or roadmap).
- Live ride simulation. The on-screen kombi animation has a known bug we did not fix in the available time. The video tells that part of the story through animation, not screen capture.
- "Continue as Takunda" CTA on the landing page. Removed in V1. The landing now uses location-first onboarding, then a suburb picker as fallback.

## Output format

3-minute MP4, 1080p preferred, 60 fps if possible, AAC audio. Uploaded as YouTube unlisted for the submission form.
