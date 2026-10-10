import { json, route, ApiError, params } from "@/lib/api";
import { requireUser } from "@/lib/session";
import { getConversation, listMessages, getMatchView } from "@/lib/services/connections";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

export const GET = route<Ctx>(async (_req, ctx) => {
  const { id } = await params(ctx);
  const me = await requireUser();
  const conversation = getConversation(me, id);
  if (!conversation) throw new ApiError(404, "Conversation not found");
  const messages = listMessages(me, id);
  const match = conversation.matchId ? getMatchView(conversation.matchId, me) : null;
  return json({ conversation, messages, match, me: me.id });
});
