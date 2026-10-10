import { json, route } from "@/lib/api";
import { currentUser } from "@/lib/session";
import { listConversations } from "@/lib/services/connections";

export const dynamic = "force-dynamic";

export const GET = route(async () => {
  const me = await currentUser();
  return json({ conversations: me ? listConversations(me) : [] });
});
