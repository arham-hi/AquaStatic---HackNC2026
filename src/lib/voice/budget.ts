// ElevenLabs budget guard for the radio station. The subscription endpoint is the source of truth;
// answers are cached for 5 minutes so segment planning never hammers the API.
//
// Reads process.env directly (not lib/env) so tests can flip RADIO_VOICE / the key after imports load.

const CACHE_MS = 5 * 60 * 1000;
let cache: { at: number; remaining: number; limit: number } | null = null;
let warned = false;

export const reserveChars = () => Math.max(0, Number(process.env.ELEVENLABS_RESERVE_CHARS) || 3000);
export const radioVoiceMode = () => (process.env.RADIO_VOICE === "browser" ? "browser" : "auto");
const apiKey = () => process.env.ELEVENLABS_API_KEY || "";

export type VoiceBudget = { remaining: number; limit: number } | null;

/** Remaining/limit characters, or null when the key is missing or the API can't be reached. */
export async function subscription(): Promise<VoiceBudget> {
  if (!apiKey()) return null;
  if (cache && Date.now() - cache.at < CACHE_MS) return { remaining: cache.remaining, limit: cache.limit };
  try {
    const res = await fetch("https://api.elevenlabs.io/v1/user/subscription", { headers: { "xi-api-key": apiKey() } });
    if (!res.ok) return cache ? { remaining: cache.remaining, limit: cache.limit } : null;
    const d = (await res.json()) as { character_limit?: number; character_count?: number };
    const limit = d.character_limit ?? 0;
    const remaining = Math.max(0, limit - (d.character_count ?? 0));
    cache = { at: Date.now(), remaining, limit };
    return { remaining, limit };
  } catch {
    return cache ? { remaining: cache.remaining, limit: cache.limit } : null;
  }
}

export async function remainingCharacters(): Promise<number | null> {
  const s = await subscription();
  return s ? s.remaining : null;
}

/** Which voice should render a segment. ElevenLabs only when the key exists, policy allows it,
 *  and spending `text` still leaves the demo reserve untouched. */
export async function voiceFor(text: string): Promise<"elevenlabs" | "browser"> {
  if (!apiKey() || radioVoiceMode() === "browser") return "browser";
  const s = await subscription();
  if (s && s.remaining - text.length >= reserveChars()) return "elevenlabs";
  if (s && !warned) {
    warned = true;
    console.warn(`[station] ElevenLabs budget low (${s.remaining} chars left, reserve ${reserveChars()}) — using browser voice`);
  }
  return "browser";
}

/** Test hook: drop the cached subscription answer. */
export function resetBudgetCache() {
  cache = null;
  warned = false;
}
