import { json, parseBody, route } from "@/lib/api";
import { currentUser, requireUser } from "@/lib/session";
import { ProfileSchema, updateProfile } from "@/lib/services/users";
import { unreadCount } from "@/lib/services/notifications";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

export const GET = route(async () => {
  const user = await currentUser();
  return json({ user, unread: user ? unreadCount(user.id) : 0, demoMode: env.demoMode });
});

export const PATCH = route(async (req) => {
  const user = await requireUser();
  const patch = await parseBody(req, ProfileSchema);
  return json({ user: updateProfile(user, patch) });
});
