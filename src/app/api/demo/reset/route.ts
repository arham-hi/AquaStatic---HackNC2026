import { json, route } from "@/lib/api";
import { requireDemoMode } from "@/lib/guard";
import { resetDemoData, seedDemoData } from "@/lib/services/demo";
import { resetRateLimits } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/** Restore the beginning of the demo: wipe demo rows, reseed scenarios. Never touches real user content. */
export const POST = route(async (req) => {
  requireDemoMode();
  const reseed = new URL(req.url).searchParams.get("reseed") !== "0";
  (await resetDemoData());
  resetRateLimits();
  const seeded = reseed ? await seedDemoData() : [];
  return json({ ok: true, seeded: seeded.length });
});
