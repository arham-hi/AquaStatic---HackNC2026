import fs from "node:fs";
import { route, ApiError, params } from "@/lib/api";
import { getBriefing, setBriefingAudio } from "@/lib/services/briefings";
import { synthesizeToFile, ElevenLabsError } from "@/lib/voice/elevenlabs";
import { hasElevenLabs } from "@/lib/env";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

/** MP3 for a station segment. 503 when the segment was budgeted for browser speech — the client uses TTS. */
export const GET = route<Ctx>(async (_req, ctx) => {
  const { id } = await params(ctx);
  const b = getBriefing(id);
  if (!b || b.format !== "station") throw new ApiError(404, "Segment not found");
  if (b.audioProvider !== "elevenlabs") throw new ApiError(503, "Segment is browser-voice");
  if (!hasElevenLabs()) throw new ApiError(503, "ElevenLabs not configured");
  try {
    const file = b.audioRef && fs.existsSync(b.audioRef) ? b.audioRef : await synthesizeToFile(b.id, b.script);
    if (file !== b.audioRef) setBriefingAudio(b.id, file);
    const buf = fs.readFileSync(file);
    return new Response(new Uint8Array(buf), { headers: { "content-type": "audio/mpeg", "content-length": String(buf.length), "cache-control": "private, max-age=86400" } });
  } catch (e) {
    if (e instanceof ApiError) throw e;
    // Upstream 4xx = deterministic policy/auth problem with the configured voice (e.g. a PVC voice on
    // the Free tier) — signal 503 so the client falls back to browser TTS; real 5xx stays 502.
    const upstream = e instanceof ElevenLabsError ? e.status : 0;
    const code = upstream >= 400 && upstream < 500 ? 503 : 502;
    throw new ApiError(code, `Studio voice unavailable: ${(e as Error).message.slice(0, 160)}`);
  }
});
