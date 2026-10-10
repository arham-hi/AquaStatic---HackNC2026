import { json, route } from "@/lib/api";
import { env } from "@/lib/env";
import { DEMO_USERS, DEMO_STEPS, ensureDemoUsers } from "@/lib/services/demo";
import { currentUser, publicUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export const GET = route(async () => {
  if (!env.demoMode) return json({ demoMode: false, users: [], steps: {} });
  ensureDemoUsers();
  const me = await currentUser();
  return json({ demoMode: true, users: DEMO_USERS.map(publicUser), steps: DEMO_STEPS, currentUserId: me?.id ?? null });
});
