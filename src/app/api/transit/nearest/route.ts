import { json, route, ApiError } from "@/lib/api";
import { loadTransit } from "@/lib/services/transit";
import { distanceMeters } from "@/lib/locations";

export const dynamic = "force-dynamic";

/** Nearest bus stop to a point, from the cached GTFS data. Cheap: no network, one scan of ~520 stops. */
export const GET = route(async (req) => {
  const u = new URL(req.url);
  const lat = Number(u.searchParams.get("lat")), lng = Number(u.searchParams.get("lng"));
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) throw new ApiError(400, "lat and lng are required");
  const t = await loadTransit();
  let best: { id: string; name: string; code: string; meters: number; routes: string[] } | null = null;
  for (const s of t.stops) {
    const d = distanceMeters(lat, lng, s.lat, s.lng);
    if (!best || d < best.meters) best = { id: s.id, name: s.name, code: s.code, meters: Math.round(d), routes: [] };
  }
  if (best) best.routes = t.routes.filter((r) => r.stopIds.includes(best!.id)).map((r) => r.shortName).slice(0, 6);
  return json({ stop: best, demo: t.mode === "demo", trackingUrl: t.trackingUrl });
});
