import { json, route } from "@/lib/api";
import { currentUser } from "@/lib/session";
import { listMyMatches, listRecentMatches } from "@/lib/services/connections";

export const dynamic = "force-dynamic";

export const GET = route(async (req) => {
  const user = await currentUser();
  const scope = new URL(req.url).searchParams.get("scope");
  if (scope === "recent") {
    // Public, anonymized view for the map's connection animation: no titles beyond what is already public on the map.
    const recent = listRecentMatches(20, user).filter((m) => m.status === "suggested" || m.status === "accepted");
    return json({ matches: recent.map((m) => ({ id: m.id, status: m.status, score: m.score, createdAt: m.createdAt, request: { id: m.request.id, locationId: m.request.locationId, title: m.request.title }, offer: { id: m.offer.id, locationId: m.offer.locationId, title: m.offer.title } })) });
  }
  return json({ matches: user ? listMyMatches(user) : [] });
});
