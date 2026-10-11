import { json, route } from "@/lib/api";
import { listSources } from "@/lib/services/sources";

export const dynamic = "force-dynamic";

export const GET = route(async () => json({ sources: (await listSources()) }));
