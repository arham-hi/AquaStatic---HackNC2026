import { json, route } from "@/lib/api";
import { requireCronOrDemo } from "@/lib/guard";
import { integrationStatusProbe } from "@/lib/services/integrations";

export const dynamic = "force-dynamic";

export const POST = route(async (req) => {
  requireCronOrDemo(req);
  return json({ integrations: await integrationStatusProbe() });
});
