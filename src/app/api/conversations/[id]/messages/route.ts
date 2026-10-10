import { z } from "zod";
import { json, parseBody, route, ApiError, params } from "@/lib/api";
import { requireUser } from "@/lib/session";
import { sendMessage } from "@/lib/services/connections";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

export const POST = route<Ctx>(async (req, ctx) => {
  const { id } = await params(ctx);
  const me = await requireUser();
  const rl = rateLimit(`msg:${me.id}`, 40, 60_000);
  if (!rl.ok) throw new ApiError(429, "Slow down a little.");
  const { content } = await parseBody(req, z.object({ content: z.string().trim().min(1).max(2000) }));
  return json({ message: sendMessage(me, id, content) }, { status: 201 });
});
