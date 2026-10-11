import { json, route } from "@/lib/api";
import { nextSegments } from "@/lib/services/station";

export const dynamic = "force-dynamic";

/** Polled by the radio page. Creates at most one new segment when the rules qualify, returns what's new. */
export const GET = route(async (req) => {
  const after = new URL(req.url).searchParams.get("after");
  return json(await nextSegments(after || null));
});
