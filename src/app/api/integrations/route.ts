import { json, route } from "@/lib/api";
import { integrationStatusQuick } from "@/lib/services/integrations";

export const dynamic = "force-dynamic";

export const GET = route(async () => json({ integrations: integrationStatusQuick() }));
