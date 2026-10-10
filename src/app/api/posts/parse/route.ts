import { z } from "zod";
import { json, parseBody, route } from "@/lib/api";
import { parsePost } from "@/lib/ai";
import { getLocation } from "@/lib/locations";

export const dynamic = "force-dynamic";

/** Preview interpretation only. Nothing is saved until the user confirms via POST /api/posts. */
export const POST = route(async (req) => {
  const { text } = await parseBody(req, z.object({ text: z.string().trim().min(3).max(500) }));
  const parsed = await parsePost(text);
  return json({ parsed, location: getLocation(parsed.locationId) });
});
