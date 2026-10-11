// Demo-video only: renders the two scripted voice lines ONCE with the configured ElevenLabs
// voice into data/demo-voice/ (gitignored). The /api/demo-voice route serves these files for
// unlimited replay — no credits are spent on playback. Re-run only if the script or voice changes.
//
//   node scripts/make-demo-voice.mjs
//
// Requires ELEVENLABS_API_KEY in .env (or the environment).

import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(process.cwd());
const OUT_DIR = path.join(ROOT, "data", "demo-voice");
const MODEL = "eleven_turbo_v2_5"; // same studio model + settings as src/lib/voice/elevenlabs.ts
const VOICE_SETTINGS = { stability: 0.45, similarity_boost: 0.75, style: 0.35, use_speaker_boost: true };

const CLIPS = {
  bus: "Hey! You got a few options. You can either take another bus route which is 5 minutes away or you can go on a rideshare! It looks like Aadee is also going to the library and is 2 minutes away from you; you should go and connect with him!",
  events: "Hey! Based on your previously liked events, there is a chess club meeting at 6 pm at Wilson Library, or you can go to this hackathon which is going on at Fetzer Gym!",
};

function loadEnv() {
  const file = path.join(ROOT, ".env");
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m || process.env[m[1]]) continue;
    process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

async function subscription(key) {
  const res = await fetch("https://api.elevenlabs.io/v1/user/subscription", { headers: { "xi-api-key": key } });
  if (!res.ok) return null;
  const d = await res.json();
  return { used: d.character_count ?? 0, limit: d.character_limit ?? 0, remaining: Math.max(0, (d.character_limit ?? 0) - (d.character_count ?? 0)) };
}

async function main() {
  loadEnv();
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) { console.error("ELEVENLABS_API_KEY is not set in .env — cannot generate clips."); process.exit(1); }
  const voiceId = process.env.ELEVENLABS_VOICE_ID || "cgSgspJ2msm6clMCkdW9";

  const total = Object.values(CLIPS).reduce((n, t) => n + t.length, 0);
  const before = await subscription(key);
  console.log(`Voice: ${voiceId} · model: ${MODEL}`);
  for (const [name, text] of Object.entries(CLIPS)) console.log(`  ${name}.mp3 — ${text.length} chars`);
  console.log(`Total: ${total} characters${before ? ` · subscription: ${before.remaining} remaining of ${before.limit}` : ""}`);

  fs.mkdirSync(OUT_DIR, { recursive: true });
  for (const [name, text] of Object.entries(CLIPS)) {
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`, {
      method: "POST",
      headers: { "xi-api-key": key, "content-type": "application/json", accept: "audio/mpeg" },
      body: JSON.stringify({ text, model_id: MODEL, voice_settings: VOICE_SETTINGS }),
    });
    if (!res.ok) { console.error(`ElevenLabs ${res.status}: ${(await res.text()).slice(0, 200)}`); process.exit(1); }
    const file = path.join(OUT_DIR, `${name}.mp3`);
    fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
    console.log(`Wrote ${file} (${fs.statSync(file).size} bytes)`);
  }

  const after = await subscription(key);
  if (before && after) console.log(`Credits used: ${before.used} -> ${after.used} (${after.used - before.used} chars, ${after.remaining} remaining)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
