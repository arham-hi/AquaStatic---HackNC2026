import { json, route, params } from "@/lib/api";
import { requireUser } from "@/lib/session";
import { claimOffer } from "@/lib/services/connections";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

/** Claim an open offer (giveaway, free food). Creates the match; the giver still has to accept. */
export const POST = route<Ctx>(async (_req, ctx) => {
  const { id } = await params(ctx);
  const me = await requireUser();
  return json({ match: (await claimOffer(me, id)) }, { status: 201 });
});
