import { json, route } from "@/lib/api";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Creates (or reuses) a guest profile and sets the signed session cookie. */
export const POST = route(async () => json({ user: await requireUser() }));
