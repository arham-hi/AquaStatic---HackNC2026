# Aqua Static — 2-minute live demo for HackNC judges

**Setup (before judges arrive):** `npm run setup && npm run dev`. Open `http://localhost:3000` in **two browser windows** side by side (or one normal + one incognito). In window A pick **Aadee (Demo)** from the demo profile switcher (Profile → Demo profiles, or `/developer`). In window B pick **Jordan (demo)**. Keep `/developer` open in a third tab as your remote. Dark theme looks best on a projector.

Everything on screen marked **DEMO** is simulated sample data. Nothing else is touched by the seed or the reset.

---

### 0:00 — A living campus (window A, home map)
> "Campus life is scattered across email, group chats, Instagram and flyers. Aqua Static turns it into one live layer: a real 3D map of Chapel Hill."

- The map already shows a real community: amber requests, mint offers, purple lost & found, green giveaways, teal food, plus the bus layer. Every pin is a real post in the database — the demo ones are labeled DEMO.
- Drag to rotate, scroll to tilt. Click a marker → the detail card shows how the AI read it (type, item, urgency, expiry).

### 0:25 — Connect is already alive (window A → Connect)
> "This isn't an empty app. People have been posting all day — requests, offers, study sessions, free food."

- Scroll the feed. Point out the demo badges.
- **Your matches** already shows a suggested match: *"Need a USB-C laptop charger at Davis Library"* ↔ *"Spare USB-C laptop charger near Carolina Union."*

### 0:45 — AquaMatch explains itself
- Click **Why? 90%+** — the explainable score appears: item 40% · availability 25% · location 20% · keywords 15%.
- Click **View on map** — the 3D map draws a glowing arc from Davis Library to the Carolina Union.

### 1:05 — Both sides connect (the real workflow)
- As **Aadee** (window A): **Accept** the charger match. "Chat opens as soon as they accept too."
- Switch window B to **Jordan (demo)** → Connect → **Accept**. The conversation opens.
- Send a real message ("3rd floor by the windows?"). Watch it arrive in window A with a notification — no refresh.
- Click **Mark complete** → the celebration plays, both posts flip to fulfilled/resolved.

> "That's a real matching engine over a real database — request, offer, dual acceptance, conversation, completion. Two profiles, two browsers, one shared state."

### 1:35 — AquaImpact
- Open **/impact**. Every counter ticked up by exactly one — resources shared, students helped, connections, items kept in use — all computed from completed matches in the database. Demo exchanges are labeled, never hidden or inflated.
- Point out the hourly activity chart and the "DEMO" badges on recent exchanges.

### 1:55 — Close
> "Every charger borrowed here is one not bought. Living map, intelligent connections, a personalized media layer — one shared, real-time system, built in a weekend."

*(If time remains: generate a Campus Radio briefing — it reads this community activity back, and says "demo" where data is simulated.)*

---

### What was seeded (all labeled DEMO)

| Kind | Content |
|---|---|
| Completed exchanges (8) | Aadee↔Jordan charger borrow · Priya↔Aadee calculator giveaway · Alex↔Aadee study group · Sam↔Aadee textbook lend · Maya↔Sam pizza · Priya↔Jordan chem tutoring · Alex↔Maya found water bottle · Sam↔Alex grocery ride |
| Ongoing (1) | Aadee↔Maya HDMI cable — accepted, conversation open, not completed |
| Live suggested matches | Aadee↔Jordan **charger pair (the live demo)** · Maya↔Aadee calculator · Priya↔Jordan chem study |
| Other open posts | Lost wallet (Pit) · found keys (Student Stores) · water bottle + desk chair giveaways · writing + CS tutoring · bagels at Lenoir · ride to Southpoint · spare umbrella · COMP 550 study partner · simulated open-mic event · simulated P2P delay notice |

### If something goes wrong
- **Reset:** `/developer` → *Reset demo to start* (wipes only demo rows, then reseeds — restores the charger match deterministically). Real user data is never touched.
- **No time to click through:** `/developer` → *Inject Aadee's charger request* then *Inject Jordan's charger offer* (idempotent — won't duplicate).
- **Aadee not in the switcher:** run `npm run db:seed` or hit `/api/demo/seed`, then refresh.
- **Offline venue:** map tiles need internet. Transit falls back to a labeled DEMO overlay; feeds show cached items.
- **Keys:** everything above works with no API keys. With `GEMINI_API_KEY` the interpretation and radio script get richer; with `ELEVENLABS_API_KEY` the radio voice upgrades.
