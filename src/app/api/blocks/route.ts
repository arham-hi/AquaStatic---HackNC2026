import { z } from "zod";
import { json, parseBody, route } from "@/lib/api";
import { requireUser } from "@/lib/session";
import { blockUser } from "@/lib/services/connections";

export const dynamic = "force-dynamic";

export const POST = route(async (req) => {
  const me = await requireUser();
  const { userId } = await parseBody(req, z.object({ userId: z.string().min(1).max(100) }));
  (await blockUser(me, userId));
  return json({ ok: true }, { status: 201 });
});
