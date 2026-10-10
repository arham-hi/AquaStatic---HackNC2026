import { json } from "@/lib/api";
import { env, hasElevenLabs, hasGemini, hasPhoton } from "@/lib/env";
import { getDb } from "@/lib/db/client";

export const dynamic = "force-dynamic";

export async function GET() {
  getDb();
  return json({ ok: true, demoMode: env.demoMode, gemini: hasGemini(), elevenlabs: hasElevenLabs(), photon: hasPhoton(), time: Date.now() });
}
