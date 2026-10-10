import { z } from "zod";
import { json, parseBody, route } from "@/lib/api";
import { requireDemoMode } from "@/lib/guard";
import { handleChannelMessage } from "@/lib/services/channels";

export const dynamic = "force-dynamic";

/** Demo-only iMessage simulator: runs the exact command handler the Photon worker uses. No real texts are sent. */
export const POST = route(async (req) => {
  requireDemoMode();
  const { handle, text } = await parseBody(req, z.object({ handle: z.string().trim().min(3).max(60).default("sim:+15550000000"), text: z.string().trim().min(1).max(500) }));
  const reply = await handleChannelMessage(`sim:${handle.replace(/^sim:/, "")}`, text);
  return json({ reply: reply.text, simulated: true });
});
