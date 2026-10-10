# Aqua Static Radio — 24/7 station with a mascot host

Build plan for the teammate taking the Radio page. Read it once end to end before touching code. Everything you need already exists in the backend; this task is mostly a new page plus one small server service.

## 0. The hard limit you must design around

**ElevenLabs is on the free tier: 10,000 characters per month, total, shared by the whole team through one key.** The budget resets monthly, not daily. Today is Oct 10; the live demo is Oct 11.

What things cost:

| Speech | Characters | Share of budget |
|---|---|---|
| One 30-second "update" segment (~60 words) | ~400 | 4% |
| One 2–3 minute Campus Radio briefing | ~2,000 | 20% |
| One "time check" line | ~80 | 1% |

Rules, non-negotiable:

1. **Develop with the browser voice.** Set `RADIO_VOICE=browser` in your `.env` while building. ElevenLabs must not be called by any dev or test run unless you set it on purpose.
2. **You get two ElevenLabs test runs total** before the demo: one short update segment and one roundup. About 800 characters. Do them at the end, when the player is finished, not while iterating.
3. **Keep a 3,000-character reserve for the demo.** The code enforces this (see §4), and the developer page shows the remaining budget. If the number drops under 3,000 before the demo, stop using ElevenLabs and tell the team.
4. **Every spoken segment is synthesized once and cached on disk.** Replaying is free. Never regenerate audio for the same text.
5. **Automated tests never touch ElevenLabs.** The e2e server already runs with an empty key; keep it that way.

If the team buys the $5 starter plan (30,000 characters) the same rules apply with bigger numbers. Don't assume it.

## 1. What we're building

The Radio tab stops being a form. It becomes a station that is always on:

- A cute radio mascot, Aero style, is the host. It bobs to the music, and its speaker/mouth moves when it talks.
- The host speaks short segments about what is actually happening: a new request or offer just posted, a lost dog, an event starting soon, an official alert, a top-of-the-hour roundup, a time check.
- Between segments, royalty-free music plays so it is never silent. Music ducks under the voice and comes back up.
- One big **Tune in** button, because browsers block audio until the user taps. After that: **Mute** and **Skip**. No format pickers, no interest chips, no length control.
- Under the mascot: the line being spoken right now, and a small "Now talking about" card that links to the post or event.
- A quiet "Recent segments" list underneath so judges can scroll back.

Everything spoken comes from the database. Nothing invented. Demo posts get "demo" said out loud, same as today.

## 2. What already exists (reuse, don't rebuild)

| Need | Already there |
|---|---|
| Items to talk about | `gatherBriefingItems()` and `toRecord()` in `src/lib/services/briefings.ts` return alerts, community posts, events, news, transit from the real feed |
| Script writing | `composeBriefingScript()` in `src/lib/ai/index.ts` (Gemini, Zod-validated) and the local template writer in `briefings.ts` as fallback |
| Voice files | `synthesizeToFile(id, text)` in `src/lib/voice/elevenlabs.ts` caches MP3s under `data/audio/` |
| Live updates in the browser | `useLive()` hook in `src/hooks/useLive.ts` (SSE + 3s polling); scopes `posts`, `matches`, `briefings` |
| Knowing when something new was posted | `bump("posts")` fires on every create; `posts.createdAt` lets the server find "new since last segment" |
| Storage for segments | the `briefings` table. Use `format: "station"` (add `"station"` to `BRIEFING_FORMATS` in `src/lib/db/schema.ts`; it's a text column, no migration needed) |
| Browser voice player | `src/components/radio/use-briefing-audio.ts` already handles SpeechSynthesis queueing, ElevenLabs MP3 playback, and fallback; lift what you need |
| Design tokens | `.glass-strong`, `.btn-aero`, `.btn-grass`, `.bubble`, `--carolina`, `--mint` in `src/app/globals.css` |

## 3. Server: the station service

New file `src/lib/services/station.ts`. Pure planning logic, no timers (Next has no long-running process in dev; the client's poll drives it).

```
nextSegments(afterId: string | null, now = Date.now()): Segment[]
```

Called by `GET /api/station?after=<lastSegmentId>` every 10 seconds from the page (via `useLive`). It returns any segments created since `afterId`, creating new ones first if the rules below say so. Keep it idempotent: if nothing qualifies, return `[]` and do not write anything.

Segment kinds and when to create them:

| Kind | Trigger | Content | Max words |
|---|---|---|---|
| `update` | one or more posts created since the last segment (any kind) | the newest 1–3 posts: who (first name), what, where, "reply in Connect" | 60 |
| `event_soon` | an ingested event starts within 45 min and hasn't been announced | title, place, start time, source name | 45 |
| `alert` | a new official alert item | source + title + "details on Alert Carolina" | 45 |
| `roundup` | 15 minutes since the last roundup and at least 3 live items exist | the existing Campus Flash writer (`format: "flash"`, `length: "short"`) | 110 |
| `time_check` | 5 minutes with nothing else to say | "It's 4:52 on a Saturday, you're listening to Aqua Static" plus one line about how many things are live | 30 |

Rules:
- Never create two segments in one call. Priority order: `alert`, `update`, `event_soon`, `roundup`, `time_check`.
- Store each as a `briefings` row: `format: "station"`, `title` = kind label, `script` = text, `sources` = the referenced items (reuse `BriefingSourceRef`), `includesDemo`, `provider` (gemini or local), `audioProvider` decided by the budget rule below.
- Script text: try `composeBriefingScript` with a short prompt variant for `update`/`event_soon`/`alert`; if Gemini is off or fails, use a plain template. Templates must say "demo" for demo items.
- Dedupe: remember what was announced using the `sources` of the last 30 station segments; never announce the same post or event id twice except inside a `roundup`.
- `time_check` and `roundup` must not fire while the page is not being polled. That happens naturally because creation only occurs inside the GET.

## 4. Server: voice and the budget guard

New file `src/lib/voice/budget.ts`:

- `remainingCharacters()` calls `GET https://api.elevenlabs.io/v1/user/subscription` with the key, returns `character_limit - character_count`, and caches the answer for 5 minutes. This is the source of truth, not a local counter.
- `voiceFor(text)` returns `"elevenlabs"` only when all are true: key present, `RADIO_VOICE !== "browser"`, `remainingCharacters() - text.length >= RESERVE`. `RESERVE` comes from `ELEVENLABS_RESERVE_CHARS`, default `3000`. Otherwise `"browser"`.
- Log one warning line the first time a segment falls back because of budget.

Audio route: `GET /api/station/[id]/audio` reuses the existing briefing audio route logic (`src/app/api/briefings/[id]/audio/route.ts`): look up the row, if `audioProvider !== "elevenlabs"` return 503 so the client uses browser speech, else synthesize once via `synthesizeToFile` and serve the cached file. `time_check` segments are **always** browser voice; never spend budget on them.

Add to `.env.example` with comments:

```
# Radio station voice policy: auto (ElevenLabs when budget allows) | browser (never call ElevenLabs)
RADIO_VOICE=auto
# Characters to keep unspent for the live demo. Station falls back to browser voice below this.
ELEVENLABS_RESERVE_CHARS=3000
```

Developer page (`src/components/developer/developer-panel.tsx`): add one line in the ElevenLabs card: "Budget: 7,420 of 10,000 characters left · reserve 3,000". Read it from a new `GET /api/station/budget` that returns `remainingCharacters()`. This is how the team checks before the demo.

## 5. Music bed

- Two or three instrumental tracks, 2–4 minutes each, under 3 MB each, placed in `public/music/`. Calm lo-fi or light ambient fits the Aero mood.
- Source: Pixabay Music (https://pixabay.com/music/) under the Pixabay Content License, or Free Music Archive filtered to CC0. Download the file, note title, artist, source URL and license in `docs/MUSIC_CREDITS.md`, and add a one-line pointer in the README. Nothing from YouTube, Spotify, or anything whose license you can't name.
- Playback: a single `<audio loop>` element routed through a Web Audio `GainNode`. Music gain 0.55 normally, 0.12 while a segment is speaking, with a 400 ms ramp each way. Shuffle to the next track when one ends.

## 6. Client: the page

Replace the contents of `src/app/radio/page.tsx` and build under `src/components/radio/`:

- `station-page.tsx` — layout: mascot centered, Tune in / Mute / Skip, "now speaking" line, "Now talking about" card, recent segments list. One column on phones.
- `mascot.tsx` — an inline SVG radio: rounded body, two dials, a speaker grille, a small antenna, Aero gloss (white highlight across the top, soft blue shadow). States: `idle` (gentle bob, 3 s loop), `talking` (grille bars pulse with the voice), `music` (slow bob plus a tiny antenna sway). Use CSS classes for the states; respect `prefers-reduced-motion` (the global CSS already stops animations).
- `use-station.ts` — the engine in the browser:
  1. `useLive("/api/station?after=" + lastId, { interval: 10000, scopes: ["posts", "briefings"] })` keeps a queue of unplayed segments.
  2. On **Tune in**: create the `AudioContext`, start music, mark `tunedIn`.
  3. When tuned in and the queue is non-empty and nothing is speaking: take the next segment, duck music, play it (MP3 via `<audio>` if `GET /api/station/:id/audio` returns 200, otherwise `speechSynthesis` with one utterance per sentence), set mascot to `talking`, on end restore music and set `music`.
  4. **Skip** cancels the current segment and moves on. **Mute** silences both music and voice but keeps the queue moving so the transcript still updates.
  5. Mouth animation: for MP3, an `AnalyserNode` on the voice element; for browser speech, toggle on `onboundary` events.
  6. If `speechSynthesis` is unavailable and no MP3, show the text and continue after `words × 350 ms`.
- Keep the old generator reachable at `/radio/studio` (move the current `radio-page.tsx` there) for the history view. Not in the nav.

Copy for the empty state before tuning in: "Aqua Static Radio · Chapel Hill's campus, live. Tap to tune in."

## 7. Remove Photon bits (we're not entering that track)

While you're in these files: delete the "Link iMessage" card in `src/components/profile/profile-view.tsx`, the iMessage simulator and the Photon row in `src/components/developer/developer-panel.tsx`, and the Photon row in `src/lib/services/integrations.ts`. Leave the worker and channel service on disk; they're harmless.

## 8. Testing policy

- Unit tests (`tests/station.test.ts`, Vitest): the planner picks the right segment kind for a given database state; dedupe never announces the same post twice; `voiceFor` returns `browser` when under reserve, when `RADIO_VOICE=browser`, and when the key is missing. Mock the subscription call; never hit the network in tests.
- E2E: one Playwright test that opens `/radio`, clicks Tune in, and sees the mascot switch to a talking or music state and a transcript line appear within 20 s. The e2e server has no ElevenLabs key, so this exercises the browser path only.
- Manual, with ElevenLabs, exactly two runs when everything else works: post something as Maya, watch the `update` segment arrive and play in Jessica's voice; then wait for one `roundup`. Check `data/audio/` has the two files. Then check the budget line on the developer page and write the number in the team chat.
- Before the demo: `RADIO_VOICE=auto`, reserve 3,000, confirm the budget line shows at least 3,000 remaining. If it doesn't, set `RADIO_VOICE=browser` and demo with the browser voice; it still works.

## 9. Demo behaviour to aim for

Judge opens Radio, taps Tune in, music starts, the mascot bobs. Someone posts "found a golden retriever near the Pit" from a phone. Within about 10 seconds the music dips and the host says "New near the Pit: Sam found a golden retriever, check Connect if that's your dog", then the music comes back. That is the whole pitch of the feature in one moment.

## 10. Done means

- [ ] `/radio` shows mascot, Tune in, Mute, Skip, transcript, "Now talking about", recent segments
- [ ] New posts become spoken segments within ~10 s while tuned in
- [ ] Music loops, ducks under speech, recovers; credits file committed
- [ ] Browser voice path works with no keys; ElevenLabs path works with the key and caches files
- [ ] Budget guard enforces the reserve; developer page shows characters remaining
- [ ] `RADIO_VOICE=browser` guarantees zero ElevenLabs calls
- [ ] Demo items are announced as "demo"
- [ ] Photon UI removed
- [ ] Vitest + the one e2e pass; `npm run build` passes
- [ ] You used at most two ElevenLabs test runs and posted the remaining budget in the team chat

Estimated effort for someone new to the codebase: 3–4 hours. Work on a branch named `radio`, pull `main` first, and don't touch `src/components/map/` or the shell files.
