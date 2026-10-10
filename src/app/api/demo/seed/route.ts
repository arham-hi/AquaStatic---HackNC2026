import { json, route } from "@/lib/api";
import { requireDemoMode } from "@/lib/guard";
import { seedDemoData } from "@/lib/services/demo";

export const dynamic = "force-dynamic";

export const POST = route(async () => {
  requireDemoMode();
  const seeded = await seedDemoData({ reset: true });
  return json({ ok: true, seeded: seeded.length, matches: seeded.reduce((n, s) => n + s.matches.length, 0) });
});
