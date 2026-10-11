import { json, route } from "@/lib/api";
import { mapMarkers } from "@/lib/services/feed";
import { activityCounts } from "@/lib/services/posts";

export const dynamic = "force-dynamic";

export const GET = route(async () => json({ markers: (await mapMarkers()), counts: (await activityCounts()) }));
