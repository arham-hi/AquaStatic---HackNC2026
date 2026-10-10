import { z } from "zod";
import { json, parseBody, route, ApiError } from "@/lib/api";
import { requireDemoMode } from "@/lib/guard";
import { DEMO_USERS, ensureDemoUsers } from "@/lib/services/demo";
import { setSessionCookie, clearSessionCookie } from "@/lib/session";
import { getUser } from "@/lib/services/users";

export const dynamic = "force-dynamic";

/** Demo-only account switching. Only the fixed demo profiles can be assumed. */
export const POST = route(async (req) => {
  requireDemoMode();
  const { userId } = await parseBody(req, z.object({ userId: z.string().nullable() }));
  if (!userId) { await clearSessionCookie(); return json({ user: null }); }
  if (!DEMO_USERS.some((u) => u.id === userId)) throw new ApiError(400, "Not a demo profile");
  ensureDemoUsers();
  await setSessionCookie(userId);
  return json({ user: getUser(userId) });
});
