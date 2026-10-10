import { json, route } from "@/lib/api";
import { requireUser } from "@/lib/session";
import { createLinkCode } from "@/lib/services/channels";

export const dynamic = "force-dynamic";

/** One-time code the user texts to the Aqua Static iMessage line to link their phone to this account. */
export const POST = route(async () => {
  const me = await requireUser();
  return json(createLinkCode(me.id), { status: 201 });
});
