import { json, route } from "@/lib/api";
import { impactDashboard } from "@/lib/services/impact";

export const dynamic = "force-dynamic";

/** Public AquaImpact dashboard. Titles and locations only — no private user data or message content. */
export const GET = route(async () => json(await impactDashboard()));
