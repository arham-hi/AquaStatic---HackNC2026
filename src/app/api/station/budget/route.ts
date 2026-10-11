import { json, route } from "@/lib/api";
import { subscription, reserveChars, radioVoiceMode } from "@/lib/voice/budget";

export const dynamic = "force-dynamic";

/** ElevenLabs character budget for the developer page. Null fields when the key is missing/unreachable. */
export const GET = route(async () => {
  const s = await subscription();
  return json({ remaining: s?.remaining ?? null, limit: s?.limit ?? null, reserve: reserveChars(), mode: radioVoiceMode() });
});
