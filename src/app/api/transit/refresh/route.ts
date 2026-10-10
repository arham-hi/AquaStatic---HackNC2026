import { json, route } from "@/lib/api";
import { requireCronOrDemo } from "@/lib/guard";
import { loadTransit, transitSummary } from "@/lib/services/transit";

export const dynamic = "force-dynamic";

export const POST = route(async (req) => {
  requireCronOrDemo(req);
  return json(transitSummary(await loadTransit({ force: true })));
});
