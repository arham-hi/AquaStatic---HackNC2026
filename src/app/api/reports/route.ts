import { z } from "zod";
import { json, parseBody, route } from "@/lib/api";
import { requireUser } from "@/lib/session";
import { reportItem } from "@/lib/services/connections";

export const dynamic = "force-dynamic";

export const POST = route(async (req) => {
  const me = await requireUser();
  const body = await parseBody(req, z.object({ itemType: z.enum(["post", "user", "message"]), itemId: z.string().min(1).max(100), reason: z.string().trim().min(3).max(500) }));
  (await reportItem(me, body.itemType, body.itemId, body.reason));
  return json({ ok: true }, { status: 201 });
});
