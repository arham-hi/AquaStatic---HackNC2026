"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, Bookmark, RefreshCw, X, Compass, ExternalLink, Clock, MapPin } from "lucide-react";
import { toast } from "sonner";
import { useLive } from "@/hooks/useLive";
import { api } from "@/lib/client";
import { useSession, useUI } from "@/components/shell/providers";
import { Page } from "@/components/shell/app-shell";
import { Button } from "@/components/ui/button";
import { Chip, Input, Dialog, DialogContent, EmptyState, Skeleton, Badge } from "@/components/ui/primitives";
import { FeedCard, FeedSkeleton, TrustBadge, TypeBadge, type FeedItemWithSaved } from "./feed-card";
import { PostDetail } from "@/components/posts/post-detail";
import { fmtDateTime } from "@/lib/time";
import { categoryMeta } from "@/lib/categories";
import type { FeedItem } from "@/lib/services/feed";

const FILTERS = [["all", "All activity"], ["events", "Events"], ["news", "News"], ["requests", "Help requests"], ["offers", "Offers"], ["lost_found", "Lost & found"], ["alerts", "Alerts"], ["transit", "Transit"], ["food", "Free food"]] as const;
const WINDOWS = [["recent", "Recent"], ["today", "Today"], ["upcoming", "Upcoming"], ["all", "Everything"]] as const;

type Resp = { items: FeedItemWithSaved[]; total: number; savedCount: number };

export function DiscoverPage() {
  const params = useSearchParams();
  const router = useRouter();
  const { user, ensureUser } = useSession();
  const { focusMap } = useUI();
  const [filter, setFilter] = useState<string>(params.get("filter") ?? "all");
  const [win, setWin] = useState<string>(params.get("window") ?? "recent");
  const [q, setQ] = useState(params.get("q") ?? "");
  const [saved, setSaved] = useState(params.get("saved") === "1");
  const [near, setNear] = useState<{ lat: number; lng: number } | null>(null);
  const [limit, setLimit] = useState(40);
  const [selected, setSelected] = useState<FeedItem | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const url = useMemo(() => {
    const sp = new URLSearchParams({ filter, window: win, limit: String(limit) });
    if (q.trim()) sp.set("q", q.trim());
    if (saved) sp.set("saved", "1");
    if (near) { sp.set("lat", String(near.lat)); sp.set("lng", String(near.lng)); sp.set("radius", "450"); }
    return `/api/feed?${sp}`;
  }, [filter, win, q, saved, near, limit]);
  const feed = useLive<Resp>(url, { interval: 5000, scopes: ["posts", "sources", "matches"] });

  // Deep link ?item=<external id> opens the detail dialog
  useEffect(() => {
    const id = params.get("item");
    if (id && feed.data) { const it = feed.data.items.find((i) => i.refId === id || i.id === id); if (it) setSelected(it); }
  }, [params, feed.data]);

  const featured = useMemo(() => feed.data?.items.find((i) => i.kind === "external" && i.type === "event" && i.imageUrl) ?? feed.data?.items.find((i) => i.type === "alert") ?? null, [feed.data]);
  const items = useMemo(() => (feed.data?.items ?? []).filter((i) => i.id !== featured?.id), [feed.data, featured]);

  const refreshSources = async () => {
    setRefreshing(true);
    try { await api.post("/api/sources/refresh"); await feed.refresh(); toast.success("Campus sources refreshed"); } catch (e) { toast.error((e as Error).message); } finally { setRefreshing(false); }
  };
  const nearMe = () => {
    if (near) return setNear(null);
    navigator.geolocation?.getCurrentPosition((p) => { setNear({ lat: p.coords.latitude, lng: p.coords.longitude }); toast.success("Showing items within ~450 m"); }, () => toast.error("Location permission denied"));
  };

  return (
    <Page title="Discover" subtitle="Events, news, alerts, transit and community updates — official feeds and student posts, clearly labeled." wide
      actions={<><Button variant="secondary" size="sm" loading={refreshing} onClick={refreshSources}><RefreshCw /> Refresh feeds</Button><Button variant={saved ? "primary" : "secondary"} size="sm" onClick={async () => { if (!user) await ensureUser(); setSaved((v) => !v); }}><Bookmark /> Saved{feed.data?.savedCount ? ` (${feed.data.savedCount})` : ""}</Button></>}>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4 min-w-0">
          <div className="card p-3 space-y-3">
            <div className="flex gap-2">
              <div className="relative flex-1"><Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-fg-faint" /><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search events, news, places, posts…" className="pl-9" aria-label="Search" />{q && <button type="button" onClick={() => setQ("")} aria-label="Clear" className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-fg-faint hover:text-fg"><X className="size-4" /></button>}</div>
              <Chip active={!!near} onClick={nearMe}><MapPin className="size-3.5" /> Nearby</Chip>
            </div>
            <div className="flex gap-1.5 overflow-x-auto no-scrollbar">{FILTERS.map(([v, l]) => <Chip key={v} active={filter === v} onClick={() => setFilter(v)}>{l}</Chip>)}</div>
            <div className="flex gap-1.5 overflow-x-auto no-scrollbar">{WINDOWS.map(([v, l]) => <Chip key={v} active={win === v} onClick={() => setWin(v)}><Clock className="size-3.5" />{l}</Chip>)}</div>
          </div>

          {feed.loading && !feed.data ? <FeedSkeleton n={6} /> : feed.error && !feed.data ? (
            <EmptyState title="Couldn't load the feed" body={feed.error} action={<Button onClick={() => feed.refresh()}>Retry</Button>} />
          ) : (
            <>
              {featured && !saved && <Featured item={featured} onOpen={() => setSelected(featured)} />}
              {items.length === 0 ? (
                <EmptyState icon={Compass} title={saved ? "Nothing saved yet" : "Nothing matches"} body={saved ? "Tap the bookmark on any card to keep it here." : "Try another filter, a wider time window, or clear the search."} />
              ) : (
                <div className="grid gap-3 md:grid-cols-2">
                  {items.map((it) => <FeedCard key={it.id} item={it} onSelect={setSelected} onSavedChange={(s) => feed.setData((d) => d ? { ...d, items: d.items.map((x) => (x.id === it.id ? { ...x, saved: s } : x)) } : d)} />)}
                </div>
              )}
              {feed.data && feed.data.total > items.length + (featured ? 1 : 0) && <div className="text-center pt-2"><Button variant="secondary" onClick={() => setLimit((l) => l + 40)}>Show more ({feed.data.total - items.length - (featured ? 1 : 0)} left)</Button></div>}
            </>
          )}
        </div>
        <aside className="space-y-4">
          <Sources />
          <div className="card p-4 text-xs text-fg-muted space-y-1.5">
            <div className="font-semibold text-fg text-sm">How to read the labels</div>
            <div className="flex items-center gap-2"><Badge tone="mint">Official source</Badge> ingested from UNC / Chapel Hill feeds, linked to the original.</div>
            <div className="flex items-center gap-2"><Badge tone="carolina">Community report</Badge> posted by a student; unverified.</div>
            <div className="flex items-center gap-2"><Badge tone="amber">DEMO</Badge> simulated for the demonstration.</div>
            <p className="pt-1">Community posts are never official safety alerts. Official emergency information: <a className="text-carolina hover:underline" href="https://alertcarolina.unc.edu" target="_blank" rel="noreferrer">alertcarolina.unc.edu</a>.</p>
          </div>
        </aside>
      </div>

      <Dialog open={!!selected} onOpenChange={(o) => { if (!o) { setSelected(null); if (params.get("item")) router.replace("/discover"); } }}>
        <DialogContent title={selected?.title ?? "Details"} hideClose className="max-w-xl">
          {selected && <PostDetail item={selected} onClose={() => setSelected(null)} />}
          {selected?.lat != null && <button type="button" className="sr-only" onClick={() => focusMap({ lat: selected.lat!, lng: selected.lng!, label: selected.locationName ?? selected.title })}>Focus map</button>}
        </DialogContent>
      </Dialog>
    </Page>
  );
}

function Featured({ item, onOpen }: { item: FeedItemWithSaved; onOpen: () => void }) {
  const meta = categoryMeta(item.category);
  return (
    <article className="relative overflow-hidden rounded-2xl border border-border bg-bg-elev shadow-md grid md:grid-cols-[1.2fr_1fr] min-h-[200px]">
      <div className="p-5 flex flex-col">
        <div className="flex items-center gap-1.5 flex-wrap"><Badge tone="carolina">Featured</Badge><TypeBadge type={item.type} /><TrustBadge item={item} /></div>
        <h2 className="mt-2 text-xl md:text-2xl font-semibold tracking-tight text-balance">{item.title}</h2>
        <p className="mt-2 text-sm text-fg-muted line-clamp-3">{item.summary}</p>
        <div className="mt-auto pt-4 flex items-center gap-3 text-xs text-fg-muted flex-wrap">
          {item.startsAt && <span className="inline-flex items-center gap-1"><Clock className="size-3.5" />{fmtDateTime(item.startsAt)}</span>}
          {item.locationName && <span className="inline-flex items-center gap-1"><MapPin className="size-3.5" />{item.locationName}</span>}
          <span className="ml-auto flex gap-2"><Button size="sm" variant="secondary" onClick={onOpen}>Details</Button>{item.url && <Button size="sm" asChild><a href={item.url} target="_blank" rel="noreferrer"><ExternalLink /> {item.sourceLabel}</a></Button>}</span>
        </div>
      </div>
      <div className="relative min-h-[160px]" style={{ background: `linear-gradient(135deg, ${meta.color}33, ${meta.color}0d)` }}>
        {item.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.imageUrl} alt="" className="absolute inset-0 size-full object-cover" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
        ) : <meta.icon className="absolute right-6 bottom-6 size-16 opacity-30" style={{ color: meta.color }} />}
      </div>
    </article>
  );
}

function Sources() {
  const s = useLive<{ sources: { id: string; name: string; homepage: string; kind: string; lastFetchedAt: string | null; lastError: string | null; lastCount: number }[] }>("/api/sources", { interval: 30000, scopes: ["sources"] });
  return (
    <div className="card p-4">
      <div className="font-semibold text-sm mb-2">Live campus sources</div>
      {!s.data ? <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-5" />)}</div> : (
        <ul className="space-y-1.5 text-xs">
          {s.data.sources.map((x) => (
            <li key={x.id} className="flex items-center gap-2">
              <span className={`size-2 rounded-full shrink-0 ${x.lastError ? "bg-red" : x.lastFetchedAt ? "bg-mint" : "bg-fg/20"}`} aria-hidden />
              <a href={x.homepage} target="_blank" rel="noreferrer" className="truncate hover:underline flex-1">{x.name}</a>
              <span className="text-fg-faint">{x.lastError ? "unavailable" : x.lastFetchedAt ? `${x.lastCount} items` : "not fetched"}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-[11px] text-fg-faint">Fetched server-side from allowlisted public feeds, deduplicated, and linked to the original publisher. Summaries only.</p>
    </div>
  );
}
