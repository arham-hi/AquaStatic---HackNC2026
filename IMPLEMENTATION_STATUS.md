# Implementation status

Honest inventory as of the initial base build (Oct 10, 2026). "Verified" means exercised by an automated test or observed in a real browser against the production build on this machine, with no API keys configured.

## Verified working

| Area | Status | How verified |
|---|---|---|
| Local run with zero keys | ✅ | `npm run setup` → `npm run build` → `npm start`; `/api/health` reports fallbacks |
| SQLite persistence + migrations | ✅ | Drizzle migration applied on first connect; vitest `services.test.ts` |
| Signed HttpOnly guest sessions, demo account switching (demo mode only) | ✅ | e2e two-browser flow uses `/api/demo/switch`; `requireUser()` auto-creates guests |
| Real Chapel Hill geography, 3D buildings, tilt/rotate/zoom/reset, 3D toggle | ✅ | MapLibre + OpenFreeMap `liberty`/`dark`; `aqua-3d` fill-extrusion from `render_height`; screenshots |
| Markers by category with DEMO labels, urgency pulse, entrance animation, detail card | ✅ | 51 markers rendered; e2e `homepage loads…` |
| Location registry (49 places + aliases) powering parsing, autocomplete, fly-to, matching | ✅ | vitest `parser.test.ts` |
| Natural-language post creation → preview → edit → publish | ✅ | e2e flow; vitest parser |
| Deterministic parser (type, category, item, subject, power class, duration, urgency, missing fields) | ✅ | vitest, 9 cases |
| Gemini structured parsing / assistant / scripts (when key set) | ⚠️ implemented, **unverified** | Code path uses `@google/genai` `responseJsonSchema` + Zod; no key available here |
| Post lifecycle: edit/delete by owner, open→matched→fulfilled/resolved, expiry sweep, presets 30m/1h/3h/today/custom | ✅ | vitest `services.test.ts` (ownership, expiry) + UI actions |
| Matching engine: weighted scoring, explanation, hard rejects (expired, same author, category, item mismatch, laptop-vs-cable, lost+lost, no time overlap, blocked, declined) | ✅ | vitest `matching.test.ts` (8 cases) |
| Match notifications, accept/decline, both-accept → conversation, complete → post statuses | ✅ | vitest + e2e |
| In-app messaging with server-side participant checks, unread, block/report | ✅ | vitest (403 for outsiders) + e2e chat |
| Real-time sync: SSE change bus + 3s polling fallback | ✅ | e2e: window B sees window A's post without reload |
| Notification center: dedupe, unread count, mark read/all, browser notifications on explicit opt-in | ✅ | vitest dedupe; UI |
| Grounded assistant with sources, "could not find" behavior, draft-before-post | ✅ | vitest + e2e |
| Radio: 5 formats, interests, length, immutable snapshots with source refs, demo labeling, browser speech playback, transcript, copy/export | ✅ | vitest briefing; e2e generate + transcript; browser-voice playback observed only via code review (no audio device in headless) |
| ElevenLabs voice + MP3 caching | ⚠️ implemented, **unverified** | No key available |
| Public sources: UNC Localist calendar, Heel Life, UNC News, Daily Tar Heel, Alert Carolina | ✅ | Live ingestion during setup: 48 + 60 + 10 + 10 + 10 items; dedupe test |
| Transit: real GTFS (22 routes, 524 stops, geometry), route select/highlight/stops, schedule PDF links, official tracker link, labeled demo fallback | ✅ | Setup log; e2e transit; GTFS parser test |
| Photon Spectrum worker + link codes + command handler | ⚠️ handler verified, SDK session **unverified** | `handleChannelMessage` covered by vitest and the `/developer` simulator; a real iMessage session needs credentials. Worker follows the documented `Spectrum()` / `app.messages` contract. |
| Demo control panel (reset, seed, inject Maya/Jordan, generate radio, open location, profile switch) | ✅ | UI exercised; API routes gated by `DEMO_MODE` |
| Integrations page with honest states, live probe | ✅ (probe for Gemini/ElevenLabs hits the network only on click) |
| Responsive layout at 1440 and 390 px, no horizontal overflow, bottom nav + sheet | ✅ | e2e `mobile.spec.ts` + screenshot sweep (18 page/viewport combos, zero console errors) |
| Light and dark themes | ✅ | cookie-persisted; screenshots |
| Type check, lint, unit tests (38), production build, e2e (7) | ✅ | all green on this machine |

## Partially working / limitations

- **Bus real-time positions**: not available; the verified feed is schedule-only. The UI says so and links to mychtransit.org. Trips' timetables (stop_times) are parsed for route↔stop membership but per-stop departure times are not shown yet.
- **Transit service notices**: no machine-readable official feed was verified; notices shown are community/demo posts of category `transit` plus a link to the official page.
- **Marker clustering**: not implemented (51 markers today; jitter fans out same-venue pins). Add clustering if the map gets crowded.
- **Gemini duplicate-story detection and relevance ranking**: not implemented; dedupe is by canonical URL, relevance by interests + recency.
- **Podcast two-voice mode**: single voice only (second ElevenLabs voice id is read from env but unused).
- **Moderation**: reports and blocks are stored and enforced for messaging; there is no admin review UI.
- **Rate limits and the SSE bus are in-process**: fine for one Node instance; move to the DB if you scale horizontally.
- **Geolocation**: used only on explicit "Find me" click, filtered to campus, never sent to the server.

## Not built (by design for the MVP)

- Account passwords / OAuth (guest profiles + signed cookies instead).
- Avatar uploads (emoji avatars).
- Push notifications beyond the browser Notification API.
- Admin dashboard.

## Known follow-ups for the team

1. **TigerData / Postgres**: the team's preferred backend. SQLite was chosen so the app runs with zero keys. Drizzle supports Postgres; the swap is `src/lib/db/schema.ts` (`pgTable` builders) + `src/lib/db/client.ts` (pg driver) + regenerating `drizzle/`. Services use Drizzle query builders only, so they should carry over.
2. **3D map owner**: `src/components/map/campus-map.tsx` is the swap point; the `MapHandle` and props at the top of the file are the contract the rest of the app relies on. `window.__aquaMap` exposes the live instance for debugging.
3. **Keys**: add `GEMINI_API_KEY` and `ELEVENLABS_API_KEY` to `.env`, then run the live probe on `/developer` to confirm.
