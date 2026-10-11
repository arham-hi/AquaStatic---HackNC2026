import { json, route } from "@/lib/api";
import { listFeed, FEED_FILTERS, FEED_WINDOWS, type FeedFilter, type FeedWindow } from "@/lib/services/feed";
import { currentUser } from "@/lib/session";
import { listBookmarks } from "@/lib/services/users";

export const dynamic = "force-dynamic";

export const GET = route(async (req) => {
  const u = new URL(req.url);
  const filter = (FEED_FILTERS as readonly string[]).includes(u.searchParams.get("filter") ?? "") ? (u.searchParams.get("filter") as FeedFilter) : "all";
  const window = (FEED_WINDOWS as readonly string[]).includes(u.searchParams.get("window") ?? "") ? (u.searchParams.get("window") as FeedWindow) : "recent";
  const lat = Number(u.searchParams.get("lat")), lng = Number(u.searchParams.get("lng"));
  const near = u.searchParams.get("lat") && Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng, meters: Number(u.searchParams.get("radius")) || 400 } : undefined;
  const saved = u.searchParams.get("saved") === "1";
  const user = await currentUser();
  const res = (await listFeed({
    filter, window, q: u.searchParams.get("q") || undefined, locationId: u.searchParams.get("location") || undefined, near, interests: user?.interests,
    limit: saved ? 500 : Math.min(200, Number(u.searchParams.get("limit")) || 60), offset: Number(u.searchParams.get("offset")) || 0,
  }));
  const marks = user ? (await listBookmarks(user)) : [];
  const savedIds = new Set(marks.map((b) => `${b.itemType === "post" ? "post" : "ext"}:${b.itemId}`));
  let items = res.items.map((i) => ({ ...i, saved: savedIds.has(i.id) }));
  if (saved) items = items.filter((i) => i.saved);
  return json({ items, total: saved ? items.length : res.total, savedCount: savedIds.size });
});
