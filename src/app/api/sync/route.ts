import { json, route } from "@/lib/api";
import { revision } from "@/lib/realtime";
import { currentUser } from "@/lib/session";
import { unreadCount } from "@/lib/services/notifications";
import { sweepExpirations, activityCounts } from "@/lib/services/posts";

export const dynamic = "force-dynamic";

/** Lightweight poll target: current change revision + per-user unread count + activity counts. */
export const GET = route(async () => {
  (await sweepExpirations());
  const me = await currentUser();
  return json({ rev: revision(), unread: me ? (await unreadCount(me.id)) : 0, counts: (await activityCounts()), at: Date.now() });
});
