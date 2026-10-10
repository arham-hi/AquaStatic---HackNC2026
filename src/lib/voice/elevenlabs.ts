import fs from "node:fs";
import path from "node:path";
import { env, hasElevenLabs } from "@/lib/env";

// ElevenLabs text-to-speech. Returns MP3 bytes. Cached per briefing on disk so audio scripts never change after generation.

const audioDir = () => path.resolve(process.cwd(), "data", "audio");

export async function synthesize(text: string, voiceId = env.elevenlabs.voiceId): Promise<Buffer> {
  if (!hasElevenLabs()) throw new Error("ELEVENLABS_API_KEY not configured");
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`, {
    method: "POST",
    headers: { "xi-api-key": env.elevenlabs.apiKey, "content-type": "application/json", accept: "audio/mpeg" },
    body: JSON.stringify({ text: text.slice(0, 4800), model_id: "eleven_turbo_v2_5", voice_settings: { stability: 0.5, similarity_boost: 0.75 } }),
  });
  if (!res.ok) throw new Error(`ElevenLabs ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return Buffer.from(await res.arrayBuffer());
}

export async function synthesizeToFile(id: string, text: string): Promise<string> {
  fs.mkdirSync(audioDir(), { recursive: true });
  const file = path.join(audioDir(), `${id}.mp3`);
  if (fs.existsSync(file)) return file;
  const buf = await synthesize(text);
  fs.writeFileSync(file, buf);
  return file;
}

export async function probeElevenLabs(): Promise<{ ok: boolean; detail: string }> {
  if (!hasElevenLabs()) return { ok: false, detail: "ELEVENLABS_API_KEY not set — browser speech synthesis in use" };
  try {
    const res = await fetch("https://api.elevenlabs.io/v1/user", { headers: { "xi-api-key": env.elevenlabs.apiKey } });
    if (!res.ok) return { ok: false, detail: `Error: HTTP ${res.status}` };
    return { ok: true, detail: `Connected (voice ${env.elevenlabs.voiceId})` };
  } catch (e) {
    return { ok: false, detail: `Error: ${(e as Error).message}` };
  }
}
