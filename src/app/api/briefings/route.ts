import { json, parseBody, route, ApiError } from "@/lib/api";
import { currentUser } from "@/lib/session";
import { GenerateBriefingSchema, generateBriefing, listBriefings } from "@/lib/services/briefings";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export const GET = route(async () => json({ briefings: (await listBriefings(12)) }));

export const POST = route(async (req) => {
  const me = await currentUser();
  const rl = rateLimit(`brief:${me?.id ?? "anon"}`, 10, 5 * 60_000);
  if (!rl.ok) throw new ApiError(429, "You've generated a lot of briefings. Give it a minute.");
  const input = await parseBody(req, GenerateBriefingSchema);
  return json({ briefing: await generateBriefing(me, input) }, { status: 201 });
});
