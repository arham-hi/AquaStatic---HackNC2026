# Aqua Static — 3-minute live demo for HackNC judges

**Setup (before judges arrive):** `npm run setup && npm run dev`. Open `http://localhost:3000` in **two browser windows** side by side (or one normal + one incognito). In window A pick **Maya (demo)** from the profile menu (top right → Demo profiles). In window B pick **Jordan (demo)**. Open `/developer` in a third tab as your remote; click **Reset demo to start** if anything looks stale. Dark theme looks best on a projector.

---

### 0:00 — The map (window A, home)
> "Campus life is scattered across email, group chats, Instagram and flyers. Aqua Static turns it into one live layer: a real 3D map of Chapel Hill."

- Drag to rotate, scroll to tilt. Point at the DEMO labels and the official Alert Carolina / UNC calendar items in the right panel.
- Click a marker → detail card shows how the AI read it (type, item, urgency, expiry).

### 0:35 — Maya needs a charger (window A)
Click the **+** button and type exactly:
> **Need a USB-C laptop charger at Davis Library for the next hour.**

Click **Interpret**. Show the structured preview: *Request · Borrow & lend · item USB-C laptop charger · Davis Library · 1 hour*. Click **Publish**.
- The marker pops onto the map at Davis Library. Window B's feed updates by itself (no refresh).

### 1:05 — Jordan has one (window B)
Click **+** and type:
> **I have an extra USB-C laptop charger at Davis until 5.**

Interpret → Publish. The toast says **"We found 1 possible match."** On the map, a green arc links the two pins. Both windows get a **Potential match found** notification.

### 1:30 — Accept and connect
- Window B → Connect → **Matches** → click **Why this match? 100%** to show the explainable score (item 40 · availability 25 · location 20 · keywords 15). Click **Accept**.
- Window A → Connect → Matches → **Accept**. It opens the conversation. Send "3rd floor by the windows." Window B replies. Click **Mark complete** → both posts update to fulfilled/resolved.

> "That's a real matching engine over a real database — no scripted animation. Two people, two browsers, one shared state."

### 2:15 — Ask the assistant (window A)
Click **Ask Aqua Static** and ask:
> **What help requests are there around Davis Library?**

It lists only stored posts, with sources and DEMO labels, and says when it can't find verified information.

### 2:35 — Aqua Static Radio (window A → Radio)
Click **Generate Campus Radio** (Campus Radio, medium). Press **play**. The briefing opens with the time, reads the official alert and headlines, the upcoming events from the UNC calendar, and the community segment that now includes the charger exchange — and says "demo" where data is simulated. Show **Sources**.

### 2:55 — Transit, close
Open **Transit**: 22 real Chapel Hill Transit routes from the GTFS feed; click **U** or **RU**; show the official tracker link ("we never fake live buses"). Back to the map: everything is still there.

> "Living map. Intelligent connections. A personalized media layer. One shared, real-time system — built in a weekend."

---

### If something goes wrong
- **Reset:** `/developer` → *Reset demo to start* (wipes only demo rows, reseeds).
- **No time to type:** `/developer` → *Inject Maya's charger request* then *Inject Jordan's charger offer*.
- **Offline venue:** the map tiles need internet. Transit falls back to a labeled DEMO overlay; feeds show their last cached items.
- **Keys:** everything above works with no API keys. With `GEMINI_API_KEY` the interpretation and radio script get richer; with `ELEVENLABS_API_KEY` the radio voice upgrades.
