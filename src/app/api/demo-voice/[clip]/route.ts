import fs from "node:fs";
import path from "node:path";
import { route, ApiError, params } from "@/lib/api";
import { env } from "@/lib/env";
import { dataDirectory } from "@/lib/data-dir";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ clip: string }> };

// Demo-video only: serves pre-generated scripted lines from data/demo-voice/.
// Development only (404 in production), whitelisted clip names, and the files live in the
// gitignored data/ directory so they can never ship in a deployment. No synthesis happens
// here — playback costs nothing.
const CLIPS = new Set(["bus", "events"]);

export const GET = route<Ctx>(async (_req, ctx) => {
  if (env.isProd) throw new ApiError(404, "Not found");
  const { clip } = await params(ctx);
  if (!CLIPS.has(clip)) throw new ApiError(404, "Unknown clip");
  const file = path.join(dataDirectory(), "demo-voice", `${clip}.mp3`);
  if (!fs.existsSync(file)) throw new ApiError(404, "Clip not generated — run scripts/make-demo-voice.mjs");
  const buf = fs.readFileSync(file);
  return new Response(new Uint8Array(buf), { headers: { "content-type": "audio/mpeg", "content-length": String(buf.length), "cache-control": "no-store" } });
});
