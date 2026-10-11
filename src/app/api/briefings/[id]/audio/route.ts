import fs from "node:fs";
import { route, ApiError, params } from "@/lib/api";
import { getBriefing, setBriefingAudio } from "@/lib/services/briefings";
import { synthesizeToFile } from "@/lib/voice/elevenlabs";
import { hasElevenLabs } from "@/lib/env";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

/** MP3 for a briefing via ElevenLabs. 503 when not configured so the client falls back to browser speech. */
export const GET = route<Ctx>(async (_req, ctx) => {
  const { id } = await params(ctx);
  const b = (await getBriefing(id));
  if (!b) throw new ApiError(404, "Briefing not found");
  if (!hasElevenLabs()) throw new ApiError(503, "ElevenLabs not configured");
  try {
    const file = b.audioRef && fs.existsSync(b.audioRef) ? b.audioRef : await synthesizeToFile(b.id, b.script);
    if (file !== b.audioRef) (await setBriefingAudio(b.id, file));
    const buf = fs.readFileSync(file);
    return new Response(new Uint8Array(buf), { headers: { "content-type": "audio/mpeg", "content-length": String(buf.length), "cache-control": "private, max-age=86400" } });
  } catch (e) {
    throw new ApiError(502, `Voice generation failed: ${(e as Error).message.slice(0, 160)}`);
  }
});
