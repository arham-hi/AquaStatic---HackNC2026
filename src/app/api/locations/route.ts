import { json, route } from "@/lib/api";
import { LOCATIONS, searchLocations, CAMPUS_CENTER } from "@/lib/locations";

export const GET = route(async (req) => {
  const q = new URL(req.url).searchParams.get("q");
  return json({ center: CAMPUS_CENTER, locations: q ? searchLocations(q, 10) : LOCATIONS });
});
