import { env } from "@/lib/env";
import { ApiError } from "@/lib/api";

/** Scheduled-job routes: allow with CRON_SECRET bearer token, or freely in demo mode (local dev). */
export function requireCronOrDemo(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  if (env.cronSecret && auth === `Bearer ${env.cronSecret}`) return;
  if (env.demoMode) return;
  throw new ApiError(401, "Unauthorized");
}

export function requireDemoMode() {
  if (!env.demoMode) throw new ApiError(403, "Demo mode is disabled");
}
