import { z } from "zod";
import { json, parseBody, route } from "@/lib/api";
import { requireUser } from "@/lib/session";
import { markAllRead, markRead, unreadCount } from "@/lib/services/notifications";

export const dynamic = "force-dynamic";

export const POST = route(async (req) => {
  const me = await requireUser();
  const body = await parseBody(req, z.object({ id: z.string().optional(), all: z.boolean().optional() }));
  if (body.all) markAllRead(me.id);
  else if (body.id) markRead(me.id, body.id);
  return json({ unread: unreadCount(me.id) });
});
