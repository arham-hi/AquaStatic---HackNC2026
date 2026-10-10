import { json, route, ApiError, params } from "@/lib/api";
import { getBriefing } from "@/lib/services/briefings";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

export const GET = route<Ctx>(async (_req, ctx) => {
  const { id } = await params(ctx);
  const briefing = getBriefing(id);
  if (!briefing) throw new ApiError(404, "Briefing not found");
  return json({ briefing });
});
