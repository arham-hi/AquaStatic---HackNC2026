import { z } from "zod";
import { json, parseBody, route, ApiError, params } from "@/lib/api";
import { requireUser, currentUser } from "@/lib/session";
import { getMatchView, respondToMatch, completeMatch, leaveMatch } from "@/lib/services/connections";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

export const GET = route<Ctx>(async (_req, ctx) => {
  const { id } = await params(ctx);
  const me = await currentUser();
  const match = (await getMatchView(id, me));
  if (!match) throw new ApiError(404, "Match not found");
  return json({ match });
});

export const POST = route<Ctx>(async (req, ctx) => {
  const { id } = await params(ctx);
  const me = await requireUser();
  const { action } = await parseBody(req, z.object({ action: z.enum(["accept", "decline", "complete", "leave"]) }));
  const match = action === "complete" ? (await completeMatch(me, id)) : action === "leave" ? (await leaveMatch(me, id)) : (await respondToMatch(me, id, action));
  return json({ match });
});
