import "dotenv/config";
import express from "express";
import * as db from "./db.js";
import { parsePost, digest, findMatch } from "./ai.js";
import { speak, audioEnabled } from "./audio.js";
import { PLACES, CAMPUS_CENTER } from "./places.js";
import { SAMPLES } from "./seed.js";

const app = express();
app.use(express.json());

// ---- Live stream (Server-Sent Events) ----
const clients = new Set();
function broadcast(event, data) {
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of clients) res.write(msg);
}

app.get("/api/stream", (req, res) => {
  res.set({ "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" });
  res.flushHeaders();
  res.write("event: hello\ndata: {}\n\n");
  clients.add(res);
  req.on("close", () => clients.delete(res));
});

// ---- Posts ----
async function createPost(raw) {
  const post = await db.insertPost(await parsePost(raw));
  broadcast("post", post);
  const match = findMatch(post, await db.livePosts(6));
  if (match) {
    await db.setMatch(post.id, match.id);
    post.matched_with = match.id;
    match.matched_with = post.id;
    broadcast("match", { a: post, b: match });
  }
  return { post, match };
}

app.get("/api/posts", async (req, res) => {
  res.json(await db.livePosts(Number(req.query.hours) || 24));
});

app.post("/api/posts", async (req, res) => {
  const raw = String(req.body?.text || "").trim();
  if (!raw || raw.length > 500) return res.status(400).json({ error: "text is required (max 500 chars)" });
  res.status(201).json(await createPost(raw));
});

// Demo helper: load sample posts through the normal pipeline so every client sees them live.
app.post("/api/seed", async (req, res) => {
  if (req.query.reset) await db.clearAll();
  const out = [];
  for (const text of SAMPLES) out.push(await createPost(text));
  res.json(out);
});

// ---- Digest + audio ----
app.get("/api/digest", async (req, res) => {
  const posts = await db.livePosts(Number(req.query.hours) || 3);
  res.json({ text: await digest(posts), count: posts.length, audio: audioEnabled });
});

app.post("/api/speak", async (req, res) => {
  const text = String(req.body?.text || "").slice(0, 2500);
  if (!audioEnabled) return res.status(503).json({ error: "ELEVENLABS_API_KEY not set" });
  try {
    res.set("content-type", "audio/mpeg").send(await speak(text));
  } catch (e) { res.status(502).json({ error: e.message }); }
});

// ---- Meta ----
app.get("/api/places", (_req, res) => res.json({ center: CAMPUS_CENTER, places: PLACES }));
app.get("/api/health", (_req, res) => res.json({ ok: true, db: db.usingDb, gemini: !!process.env.GEMINI_API_KEY, audio: audioEnabled }));

const PORT = process.env.PORT || 3001;
await db.init();
app.listen(PORT, () => console.log(`Pulse server on http://localhost:${PORT}`));
