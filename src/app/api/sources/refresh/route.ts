import { json, route } from "@/lib/api";
import { requireCronOrDemo } from "@/lib/guard";
import { refreshAllSources, pruneExternal, listSources } from "@/lib/services/sources";

export const dynamic = "force-dynamic";

export const POST = route(async (req) => {
  requireCronOrDemo(req);
  const results = await refreshAllSources({ force: true });
  (await pruneExternal());
  return json({ results, sources: (await listSources()) });
});
