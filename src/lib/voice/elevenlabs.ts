import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { env, hasElevenLabs } from "@/lib/env";
import { dataDirectory } from "@/lib/data-dir";

// ElevenLabs text-to-speech. Returns MP3 bytes. Cached per briefing on disk so audio scripts never change after generation.

const audioDir = () => path.resolve(dataDirectory(), "audio");
const MODEL = "eleven_turbo_v2_5";

export class ElevenLabsError extends Error {
  constructor(public status: number, body: string) {
    super(`ElevenLabs ${status}: ${body.slice(0, 200)}`);
  }
}

export async function synthesize(text: string, voiceId = env.elevenlabs.voiceId, model = MODEL): Promise<Buffer> {
  if (!hasElevenLabs()) throw new Error("ELEVENLABS_API_KEY not configured");
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`, {
    method: "POST",
    signal: AbortSignal.timeout(20000),
    headers: { "xi-api-key": env.elevenlabs.apiKey, "content-type": "application/json", accept: "audio/mpeg" },
    body: JSON.stringify({ text: text.slice(0, 4800), model_id: model, voice_settings: { stability: 0.45, similarity_boost: 0.75, style: 0.35, use_speaker_boost: true } }),
  });
  if (!res.ok) throw new ElevenLabsError(res.status, await res.text());
  return Buffer.from(await res.arrayBuffer());
}

/** Latency-critical synthesis for live calls — Flash is ElevenLabs' fastest English model (~75ms). */
export async function synthesizeLive(text: string): Promise<Buffer> {
  return synthesize(text, env.elevenlabs.voiceId, "eleven_flash_v2_5");
}

export async function synthesizeToFile(id: string, text: string): Promise<string> {
  fs.mkdirSync(audioDir(), { recursive: true });
  // Cache key = segment id + the full render identity (text, voice, model, settings). If the configured
  // voice or model changes, old files miss the cache instead of silently replaying the wrong voice.
  const sig = crypto.createHash("sha1")
    .update(`${env.elevenlabs.voiceId}|${MODEL}|0.45/0.75/0.35/true|${text}`)
    .digest("hex").slice(0, 12);
  const file = path.join(audioDir(), `${id}-${sig}.mp3`);
  if (fs.existsSync(file)) return file;
  const buf = await synthesize(text);
  fs.writeFileSync(file, buf);
  return file;
}

export async function probeElevenLabs(): Promise<{ ok: boolean; detail: string }> {
  if (!hasElevenLabs()) return { ok: false, detail: "ELEVENLABS_API_KEY not set — browser speech synthesis in use" };
  try {
    const res = await fetch("https://api.elevenlabs.io/v1/user", { headers: { "xi-api-key": env.elevenlabs.apiKey }, signal: AbortSignal.timeout(8000) });
    if (!res.ok) return { ok: false, detail: `Error: HTTP ${res.status}` };
    return { ok: true, detail: `Connected (voice ${env.elevenlabs.voiceId})` };
  } catch (e) {
    return { ok: false, detail: `Error: ${(e as Error).message}` };
  }
}
