import { PLACES, CATEGORIES, KINDS, findPlace } from "./places.js";

const KEY = process.env.GEMINI_API_KEY;
const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";

async function gemini(prompt, json = true) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${KEY}`;
  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: json ? { responseMimeType: "application/json" } : {},
  };
  const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`Gemini ${r.status}: ${await r.text()}`);
  const data = await r.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  return json ? JSON.parse(text) : text.trim();
}

// ---- Parse a raw message into a structured post ----

const PARSE_PROMPT = (raw) => `You structure messy student messages for a live campus map at UNC Chapel Hill.
Return JSON with exactly these fields:
- kind: one of ${JSON.stringify(KINDS)}. "need" = asking for something, "offer" = providing something, "info" = reporting a fact.
- category: one of ${JSON.stringify(CATEGORIES)}
- urgency: integer 1 (low), 2 (medium), 3 (urgent)
- title: short headline, max 8 words
- location: one of ${JSON.stringify(Object.keys(PLACES))} or null if none fits
- expires_minutes: integer, how long this stays relevant (e.g. free food 60, lost item 1440, road block 180)

Message: ${JSON.stringify(raw)}`;

function fallbackParse(raw) {
  const t = raw.toLowerCase();
  const has = (...w) => w.some((x) => t.includes(x));
  // offers first: "I have a charger if anyone needs it" contains need-words too
  const kind = has("i have", "i can", "offering", "giving away", "free ") ? "offer"
    : has("need", "looking for", "anyone", "can someone", "help me", "lost my") ? "need" : "info";
  const category = has("pizza", "food", "snack", "donut", "coffee") ? "food"
    : has("lost", "found", "missing") ? "lost_found"
    : has("blocked", "closed", "alert", "police", "fire", "flood", "emergency") ? "alert"
    : has("bus", "ride", "shuttle", "traffic") ? "transit"
    : has("event", "concert", "game", "meeting", "club", "show", "open mic") ? "event"
    : has("help", "tutor", "charger", "calc", "homework", "borrow") ? "help" : "other";
  const urgency = has("urgent", "asap", "right now", "emergency", "blocked") ? 3 : has("tonight", "soon", "today", "quick") ? 2 : 1;
  return {
    kind, category, urgency,
    title: raw.length > 60 ? raw.slice(0, 57) + "..." : raw,
    location: findPlace(raw),
    expires_minutes: category === "lost_found" ? 1440 : category === "alert" ? 180 : 120,
  };
}

export async function parsePost(raw) {
  let p;
  if (KEY) {
    try { p = await gemini(PARSE_PROMPT(raw)); }
    catch (e) { console.warn("Gemini parse failed, using fallback:", e.message); }
  }
  if (!p) p = fallbackParse(raw);
  // Sanitize: never trust the model to stay in-bounds.
  const location = PLACES[p.location] ? p.location : findPlace(raw);
  const [lat, lng] = location ? PLACES[location] : [null, null];
  return {
    raw,
    kind: KINDS.includes(p.kind) ? p.kind : "info",
    category: CATEGORIES.includes(p.category) ? p.category : "other",
    urgency: Math.min(3, Math.max(1, Number(p.urgency) || 1)),
    title: String(p.title || raw).slice(0, 120),
    location, lat, lng,
    expires_at: new Date(Date.now() + (Number(p.expires_minutes) || 120) * 60000),
  };
}

// ---- Digest ----

export async function digest(posts) {
  if (!posts.length) return "All quiet on campus right now. Nothing new to report.";
  const lines = posts.map((p) => `- [${p.category}/${p.kind}, urgency ${p.urgency}] ${p.title}${p.location ? " @ " + p.location : ""}`).join("\n");
  if (KEY) {
    try {
      return await gemini(`You are the host of Pulse, a live campus radio station for UNC Chapel Hill.
Write a 45-second spoken briefing (about 110 words) covering the most important items below.
Lead with urgent alerts, then needs people can help with, then food and events. Be warm, quick, and specific. Plain text only, no lists or markdown.

${lines}`, false);
    } catch (e) { console.warn("Gemini digest failed, using fallback:", e.message); }
  }
  return `Here's what's happening on campus right now. ${posts.slice(0, 6).map((p) => p.title + (p.location ? " at " + p.location : "")).join(". ")}. That's the Pulse.`;
}

// ---- Matching ----

// ponytail: rule-based match (same category + place, opposite kind, both live).
// Upgrade: send candidate pairs to Gemini and ask for a 0-1 compatibility score.
export function findMatch(post, candidates) {
  const want = post.kind === "need" ? "offer" : post.kind === "offer" ? "need" : null;
  if (!want) return null;
  return candidates.find((c) =>
    c.id !== post.id && c.kind === want && c.category === post.category && !c.matched_with &&
    (!post.location || !c.location || c.location === post.location)
  ) || null;
}
