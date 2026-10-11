import { z } from "zod";
import { json, parseBody, route, ApiError } from "@/lib/api";
import { currentUser } from "@/lib/session";
import { rateLimit } from "@/lib/rate-limit";
import { startCall, callTurn, endCall, dropSession } from "@/lib/services/call";

export const dynamic = "force-dynamic";

const Body = z.object({
  sessionId: z.string().trim().min(8).max(80),
  action: z.enum(["start", "say", "end"]),
  message: z.string().trim().min(1).max(400).optional(),
});

export const POST = route(async (req) => {
  const me = await currentUser();
  const ip = req.headers.get("x-forwarded-for") ?? "local";
  const { sessionId, action, message } = await parseBody(req, Body);
  const rl = rateLimit(`call:${me?.id ?? ip}`, 40, 60_000);
  if (!rl.ok) throw new ApiError(429, "Slow down — even Aqua's got call volume limits.");

  if (action === "start") return json(startCall(sessionId));
  if (action === "end") return json(endCall(sessionId));
  if (!message) throw new ApiError(400, "Nothing to say?");
  return json(await callTurn(sessionId, message));
});

export const DELETE = route(async (req) => {
  const u = new URL(req.url);
  const id = u.searchParams.get("sessionId") ?? "";
  if (id.length >= 8) dropSession(id);
  return json({ ok: true });
});
