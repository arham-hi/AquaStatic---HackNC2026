"use client";
// Home: the living campus map. The map is the feed; everything else stays out of its way.

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { RotateCcw, HeartHandshake } from "lucide-react";
import { useLive } from "@/hooks/useLive";
import { useSession, useUI } from "@/components/shell/providers";
import { TopBar } from "@/components/shell/topbar";
import { Bubbles } from "@/components/shell/bubbles";
import { PostDetail } from "@/components/posts/post-detail";
import { greeting } from "@/lib/time";
import { getLocation } from "@/lib/locations";
import { cn, plural } from "@/lib/utils";
import type { FeedItem } from "@/lib/services/feed";
import type { MapHandle, ConnectionLine } from "./campus-map";

const CampusMap = dynamic(() => import("./campus-map").then((m) => m.CampusMap), { ssr: false, loading: () => <div className="absolute inset-0 grid place-items-center bg-bg"><div className="text-sm text-fg-muted animate-pulse">Loading Chapel Hill…</div></div> });

type MarkersResponse = { markers: FeedItem[]; counts: { live: number; requests: number; offers: number; alerts: number; last24h: number } };
type RecentMatch = { id: string; status: string; createdAt: string; request: { id: string; locationId: string | null; title: string }; offer: { id: string; locationId: string | null; title: string } };

export function HomeMap() {
  const { theme, mapFocus } = useUI();
  const { user } = useSession();
  const router = useRouter();
  const params = useSearchParams();
  const data = useLive<MarkersResponse>("/api/map/markers", { interval: 3000, scopes: ["posts", "matches", "sources"] });
  const recent = useLive<{ matches: RecentMatch[] }>("/api/matches?scope=recent", { interval: 4000, scopes: ["matches"] });
  const [handle, setHandle] = useState<MapHandle | null>(null);
  const [selected, setSelected] = useState<FeedItem | null>(null);
  const knownMatches = useRef<Set<string> | null>(null);
  const [flash, setFlash] = useState<ConnectionLine[]>([]);

  const markers = data.data?.markers ?? [];
  const live = data.data?.counts.live ?? null;

  // Focus requests from the assistant, cards elsewhere, or ?item= deep links.
  useEffect(() => {
    if (!handle || !mapFocus) return;
    handle.flyTo(mapFocus.lng, mapFocus.lat, 17.2);
    if (mapFocus.itemId) { const it = markers.find((m) => m.id === mapFocus.itemId); if (it) setSelected(it); }
  }, [mapFocus, handle]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const id = params.get("item");
    if (!id || !handle || !data.data) return;
    const it = markers.find((m) => m.id === id);
    if (it && it.lat != null) { setSelected(it); handle.flyTo(it.lng!, it.lat, 17.2); }
  }, [params, data.data, handle]); // eslint-disable-line react-hooks/exhaustive-deps

  // New match → arc on the map + one toast.
  const connections = useMemo<ConnectionLine[]>(() => {
    const fresh = (recent.data?.matches ?? []).filter((m) => Date.now() - new Date(m.createdAt).getTime() < 3 * 60_000);
    return fresh.flatMap((m) => {
      const a = getLocation(m.request.locationId), b = getLocation(m.offer.locationId);
      return a && b ? [{ id: m.id, from: [a.lng, a.lat] as [number, number], to: [b.lng, b.lat] as [number, number] }] : [];
    }).concat(flash);
  }, [recent.data, flash]);

  useEffect(() => {
    if (!recent.data) return;
    const ms = recent.data.matches;
    if (!knownMatches.current) { knownMatches.current = new Set(ms.map((m) => m.id)); return; }
    for (const m of ms) {
      if (knownMatches.current.has(m.id)) continue;
      knownMatches.current.add(m.id);
      const a = getLocation(m.request.locationId), b = getLocation(m.offer.locationId);
      if (a && b) {
        setFlash((f) => [...f, { id: `flash:${m.id}`, from: [a.lng, a.lat], to: [b.lng, b.lat] }]);
        setTimeout(() => setFlash((f) => f.filter((x) => x.id !== `flash:${m.id}`)), 20_000);
      }
      toast(<span className="flex items-center gap-2"><HeartHandshake className="size-4 text-mint" /><b>Potential match found</b></span>, { description: `"${m.request.title}" ↔ "${m.offer.title}"`, action: { label: "View", onClick: () => router.push(`/connect?match=${m.id}`) }, duration: 8000 });
    }
  }, [recent.data, router]);

  const select = (it: FeedItem | null) => {
    setSelected(it);
    if (it?.lat != null) handle?.flyTo(it.lng!, it.lat, Math.max(16.8, handle.getMap()?.getZoom() ?? 16.8));
  };
  const firstName = user ? user.displayName.replace(/ \(demo\)$/, "").split(" ")[0] : "Carolina";

  return (
    <div className="relative h-dvh w-full overflow-hidden">
      <CampusMap theme={theme} markers={markers} selectedId={selected?.id ?? null} onSelect={select} show3d transit={null} connections={connections} onReady={setHandle} className="absolute inset-0" />
      <TopBar overlay />
      <Bubbles className="hidden md:block" />

      {/* One line: who you are and how much is going on. */}
      <div className="absolute left-3 md:left-4 top-[76px] md:top-[90px] glass-strong rounded-2xl px-5 py-4 animate-rise max-w-[calc(100vw-24px)]">
        <div className="aero-eyebrow !mb-2">Your campus, in real time</div>
        <h1 className="text-lg font-semibold tracking-tight leading-tight">{greeting()}, {firstName}.</h1>
        <p className="text-xs text-fg-muted mt-0.5">
          {live == null ? "Loading campus…" : live === 0 ? "Quiet right now. Be the first to post." : `${plural(live, "thing")} happening on campus right now.`}
        </p>
      </div>

      <button type="button" onClick={() => { handle?.reset(); setSelected(null); }} aria-label="Reset view" title="Reset view"
        className="absolute right-3 md:right-4 bottom-24 md:bottom-6 grid size-10 place-items-center rounded-xl glass-strong text-fg-muted hover:text-fg [&_svg]:size-4">
        <RotateCcw />
      </button>

      {/* Tapping a pin opens its card: bottom-left on desktop, a sheet on phones. */}
      {selected && (
        <aside aria-label="Details" className={cn("absolute z-20 glass-strong overflow-y-auto scrollbar-thin animate-rise",
          "md:left-4 md:bottom-6 md:w-[380px] md:max-h-[60vh] md:rounded-2xl",
          "left-0 right-0 bottom-0 max-h-[70dvh] rounded-t-3xl pb-20 md:pb-0")}>
          <div className="p-4"><PostDetail item={selected} onClose={() => setSelected(null)} /></div>
        </aside>
      )}

      {data.error && !data.data && <div className="absolute left-1/2 -translate-x-1/2 bottom-24 glass-strong rounded-xl px-3 py-2 text-xs text-red">Couldn&apos;t load the map data: {data.error}</div>}
    </div>
  );
}
