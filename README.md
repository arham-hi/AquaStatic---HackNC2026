# Pulse — the live AI map of campus life (HackNC 2026)

Students post messy natural-language updates ("need a charger at Davis", "free pizza in the Pit",
"road blocked on Franklin"). Gemini structures them, they land on a live shared campus map, needs
get matched with offers, and anyone can ask for a spoken "campus radio" digest of what matters right now.

## Run it

```bash
# terminal 1
cd server && npm install && npm run dev      # http://localhost:3001

# terminal 2
cd web && npm install && npm run dev         # http://localhost:5173
```

Click **Load demo** in the UI to fill it with sample posts. Open it in two browser windows and post
from one; the other updates instantly.

**It runs with zero keys.** Copy `.env.example` to `.env` in the repo root and fill in whichever you have:

| Key | Without it | With it |
|---|---|---|
| `DATABASE_URL` | in-memory store (lost on restart) | TigerData / Timescale hypertable |
| `GEMINI_API_KEY` | keyword-based parser + template digest | real parsing, radio-style digest |
| `ELEVENLABS_API_KEY` | browser's built-in voice | ElevenLabs voice |

Never commit `.env`. It is gitignored.

## Layout

```
server/
  index.js    Express app. Routes + Server-Sent Events broadcast.
  ai.js       Gemini calls: parsePost, digest. Rule-based findMatch. Fallbacks when no key.
  db.js       Postgres/Timescale with in-memory fallback. One table: posts.
  audio.js    ElevenLabs text-to-speech.
  places.js   Campus landmarks -> lat/lng, categories, kinds. Add places here.
  seed.js     Demo posts.
web/src/
  App.jsx     State + live subscription. Composes everything.
  Map.jsx     2D Leaflet map. THE SWAP POINT FOR 3D — see contract at top of file.
  Submit.jsx  Post box.
  Feed.jsx    Live list.
  Digest.jsx  "What's happening" + play button.
  api.js      fetch wrappers + SSE subscribe.
```

## API

| Method | Path | What |
|---|---|---|
| POST | `/api/posts` `{text}` | Parse + store + broadcast. Returns `{post, match}`. |
| GET | `/api/posts?hours=24` | Live (unexpired) posts, newest first. |
| GET | `/api/stream` | SSE. Events: `post`, `match`. |
| GET | `/api/digest?hours=3` | `{text, count, audio}` |
| POST | `/api/speak` `{text}` | MP3 bytes (503 if no ElevenLabs key). |
| POST | `/api/seed?reset=1` | Load demo posts through the live pipeline. |
| GET | `/api/places` | `{center, places}` |
| GET | `/api/health` | Which integrations are configured. |

### Post shape

```js
{ id, created_at, raw, kind: "need"|"offer"|"info",
  category: "food"|"help"|"lost_found"|"alert"|"event"|"transit"|"other",
  urgency: 1|2|3, title, location, lat, lng, expires_at, matched_with }
```

## Who works on what

- **3D map**: replace `web/src/Map.jsx`. Keep the props (`center`, `pins`, `selected`, `onSelect`). Nothing else changes.
- **AI / matching**: `server/ai.js`. Prompts live there. `findMatch` is rule-based; upgrade to Gemini scoring.
- **Audio / radio**: `server/audio.js` + `web/src/Digest.jsx`. Voice, intro music, auto-play loop, etc.
- **Data / DB**: `server/db.js`. Timescale continuous aggregates, hotspots, "last 2 hours" views.
- **UI polish**: `web/src/styles.css` and the components.

## Deliberately not built yet

Auth, moderation, bus feed ingestion, iMessage/Photon, newsletters. All clean add-ons.
