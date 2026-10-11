import { z } from "zod";
import { parseBody, route, ApiError } from "@/lib/api";
import { currentUser } from "@/lib/session";
import { rateLimit } from "@/lib/rate-limit";
import { voiceFor } from "@/lib/voice/budget";
import { synthesizeLive } from "@/lib/voice/elevenlabs";

export const dynamic = "force-dynamic";

const Body = z.object({
  sessionId: z.string().trim().min(8).max(80),
  text: z.string().trim().min(1).max(1200),
});

/** Live-call voice: MP3 when the budget guard allows ElevenLabs, 503 → client falls back to browser TTS.
 *  Audio is generated on demand and never stored — call audio is private and ephemeral. */
export const POST = route(async (req) => {
  const me = await currentUser();
  const ip = req.headers.get("x-forwarded-for") ?? "local";
  const { text } = await parseBody(req, Body);
  const rl = rateLimit(`call-audio:${me?.id ?? ip}`, 20, 60_000);
  if (!rl.ok) throw new ApiError(429, "Slow down — even Aqua's got call volume limits.");

  if ((await voiceFor(text)) !== "elevenlabs") throw new ApiError(503, "Browser voice");
  try {
    const buf = await synthesizeLive(text);
    return new Response(new Uint8Array(buf), { headers: { "content-type": "audio/mpeg", "content-length": String(buf.length), "cache-control": "no-store" } });
  } catch (e) {
    if (e instanceof ApiError) throw e;
    // A provider hiccup shouldn't kill the call — the client just uses browser TTS.
    throw new ApiError(503, `Voice generation unavailable: ${(e as Error).message.slice(0, 120)}`);
  }
});
