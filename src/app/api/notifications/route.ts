import { json, route } from "@/lib/api";
import { currentUser } from "@/lib/session";
import { listNotifications, unreadCount } from "@/lib/services/notifications";

export const dynamic = "force-dynamic";

export const GET = route(async () => {
  const me = await currentUser();
  if (!me) return json({ notifications: [], unread: 0 });
  return json({ notifications: (await listNotifications(me.id)), unread: (await unreadCount(me.id)) });
});
