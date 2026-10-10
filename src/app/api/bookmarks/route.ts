import { z } from "zod";
import { json, parseBody, route } from "@/lib/api";
import { currentUser, requireUser } from "@/lib/session";
import { listBookmarks, toggleBookmark } from "@/lib/services/users";

export const dynamic = "force-dynamic";

export const GET = route(async () => {
  const me = await currentUser();
  return json({ bookmarks: me ? listBookmarks(me) : [] });
});

export const POST = route(async (req) => {
  const me = await requireUser();
  const { itemType, itemId } = await parseBody(req, z.object({ itemType: z.enum(["post", "external"]), itemId: z.string().min(1).max(220) }));
  return json({ saved: toggleBookmark(me, itemType, itemId) });
});
