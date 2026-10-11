import { json, route } from "@/lib/api";
import { loadTransit } from "@/lib/services/transit";
import { listPosts } from "@/lib/services/posts";

export const dynamic = "force-dynamic";

export const GET = route(async () => {
  const data = await loadTransit();
  const notices = (await listPosts({ type: ["notice", "alert"], category: "transit", status: ["open"], limit: 20 }));
  return json({ ...data, notices, realtime: { available: false, officialUrl: data.trackingUrl } }, { headers: { "cache-control": "private, max-age=300" } });
});
