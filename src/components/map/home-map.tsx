"use client";
// Home: the living campus map. The map is the feed; everything else stays out of its way.

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Bus, RotateCcw, HeartHandshake, MapPin, X, ExternalLink } from "lucide-react";
import maplibregl from "@/lib/maplibre";
import { api } from "@/lib/client";
import { useLive } from "@/hooks/useLive";
import { useSession, useUI } from "@/components/shell/providers";
import { TopBar } from "@/components/shell/topbar";
import { Bubbles } from "@/components/shell/bubbles";
import { sharedTitle } from "@/components/feed/shared-tally";
import { PostDetail } from "@/components/posts/post-detail";
import { greeting } from "@/lib/time";
import { CAMPUS_CENTER, getLocation } from "@/lib/locations";
import type { TransitStop } from "@/lib/services/transit";
import { MapBusPanel, type MapTransitData } from "@/components/transit/map-bus-panel";
import { cn, matchStrength, plural } from "@/lib/utils";
import { Badge } from "@/components/ui/primitives";
import type { FeedItem } from "@/lib/services/feed";
import type { MatchView } from "@/lib/services/connections";
import type { MapHandle, ConnectionLine, MatchEndpoints } from "./campus-map";

const CampusMap = dynamic(() => import("./campus-map").then((m) => m.CampusMap), { ssr: false, loading: () => <div className="absolute inset-0 grid place-items-center bg-bg"><div className="text-sm text-fg-muted animate-pulse">Loading Chapel Hill…</div></div> });

type MarkersResponse = { markers: FeedItem[]; counts: { live: number; requests: number; offers: number; alerts: number; last24h: number; shared: number; sharedBreakdown: { total: number; borrowed: number; rehomed: number; returned: number; rides: number; food: number } } };
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
  const [focusMatch, setFocusMatch] = useState<MatchView | null>(null);
  const knownMatches = useRef<Set<string> | null>(null);
  const [flash, setFlash] = useState<ConnectionLine[]>([]);
  const [showBuses, setShowBuses] = useState(() => params.get("buses") === "1");
  const [transitData, setTransitData] = useState<MapTransitData | null>(null);
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [busesEnabled, setBusesEnabled] = useState(true);
  const [show3d, setShow3d] = useState(true);
  const [focusedStop, setFocusedStop] = useState<TransitStop | null>(null);
  const transit = useMemo(() => showBuses && transitData ? { routes: transitData.routes, stops: transitData.stops, selectedRouteId, busesEnabled } : null, [showBuses, transitData, selectedRouteId, busesEnabled]);

  const resetBusView = () => {
    setSelectedRouteId(null); setFocusedStop(null);
    handle?.getMap()?.flyTo({ center: CAMPUS_CENTER, zoom: 13.6, pitch: 45, bearing: -15, duration: 900 });
  };
  const toggleBuses = () => {
    setShowBuses((v) => !v);
    setFocusedStop(null); setSelectedRouteId(null);
  };
  useEffect(() => { if (params.get("buses") === "1") setShowBuses(true); }, [params]);
  const selectRoute = (id: string | null) => { setSelectedRouteId(id); setFocusedStop(null); setSelected(null); };
  const selectStop = (stop: TransitStop) => {
    setFocusedStop(stop); setSelected(null);
    const map = handle?.getMap();
    map?.flyTo({ center: [stop.lng, stop.lat], zoom: 16.5, pitch: Math.max(map.getPitch(), 50), offset: window.innerWidth >= 768 ? [-180, 0] : [0, -window.innerHeight * 0.23], duration: 900, essential: true });
  };

  const markers = data.data?.markers ?? [];
  const live = data.data?.counts.live ?? null;
  const shared = data.data?.counts.shared ?? 0;

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

  // ?match=<id> deep link: load the real match record and visualize its two endpoints.
  const focusId = params.get("match");
  useEffect(() => {
    if (!focusId) { setFocusMatch(null); return; }
    let stale = false;
    api.get<{ match: MatchView }>(`/api/matches/${focusId}`)
      .then((r) => { if (!stale) { setFocusMatch(r.match); setSelected(null); } })
      .catch((e: Error) => { if (!stale) { toast.error(e.message || "Couldn't load that match"); router.replace("/map"); } });
    return () => { stale = true; };
  }, [focusId, router]);

  // Real registered coordinates only — a match with a missing location gets a panel note, never a fake pin.
  const focused = useMemo(() => {
    if (!focusMatch) return null;
    const a = getLocation(focusMatch.request.locationId);
    const b = getLocation(focusMatch.offer.locationId);
    if (!a || !b) return { endpoints: null as MatchEndpoints | null, line: null as ConnectionLine | null };
    const same = a.id === b.id;
    return {
      endpoints: { id: focusMatch.id, from: [a.lng, a.lat] as [number, number], to: [b.lng, b.lat] as [number, number], fromName: a.name, toName: b.name },
      line: same ? null : { id: `focus:${focusMatch.id}`, from: [a.lng, a.lat] as [number, number], to: [b.lng, b.lat] as [number, number], focused: true },
    };
  }, [focusMatch]);

  // Frame both endpoints once we know them; same-spot matches just zoom in.
  useEffect(() => {
    const map = handle?.getMap();
    const f = focused?.endpoints;
    if (!map || !f) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const duration = reduced ? 0 : 1200;
    const mobile = window.innerWidth < 768;
    if (f.from[0] === f.to[0] && f.from[1] === f.to[1]) {
      map.flyTo({ center: f.from, zoom: 17, pitch: Math.max(map.getPitch(), 50), duration, essential: true });
    } else {
      map.fitBounds(new maplibregl.LngLatBounds(f.from, f.to), {
        padding: { top: 170, bottom: mobile ? Math.min(window.innerHeight * 0.55, 400) : 140, left: 60, right: mobile ? 60 : 420 },
        maxZoom: 16.6, duration,
      });
    }
  }, [focused, handle]);

  const closeFocus = () => { setFocusMatch(null); if (params.get("match")) router.replace("/map"); };

  // New match → arc on the map + one toast.
  const connections = useMemo<ConnectionLine[]>(() => {
    const fresh = (recent.data?.matches ?? []).filter((m) => Date.now() - new Date(m.createdAt).getTime() < 3 * 60_000);
    const lines = fresh.flatMap((m) => {
      const a = getLocation(m.request.locationId), b = getLocation(m.offer.locationId);
      return a && b ? [{ id: m.id, from: [a.lng, a.lat] as [number, number], to: [b.lng, b.lat] as [number, number] }] : [];
    }).concat(flash);
    const ambient = focusMatch ? lines.filter((l) => l.id !== focusMatch.id) : lines;
    return focused?.line ? [...ambient, focused.line] : ambient;
  }, [recent.data, flash, focused, focusMatch]);

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
    <div className="map-shell relative h-dvh w-full overflow-hidden">
      <CampusMap theme={theme} markers={markers} selectedId={selected?.id ?? null} onSelect={select} show3d={show3d} transit={transit} onRouteSelect={selectRoute} onStopSelect={selectStop} focusedStop={showBuses ? focusedStop : null} connections={connections} matchFocus={focused?.endpoints ?? null} onReady={setHandle} className="absolute inset-0" />
      <TopBar overlay />
      <Bubbles className="hidden md:block" />

      {/* One line: who you are and how much is going on. */}
      <div className={cn("absolute left-3 md:left-4 top-[76px] md:top-[90px] glass-strong rounded-2xl px-5 py-4 animate-rise", showBuses ? "hidden md:block md:max-w-[calc(100%_-_220px)]" : "max-w-[calc(100%_-_190px)] md:max-w-[calc(100%_-_220px)]")}>
        <div className="aero-eyebrow !mb-2">Your campus, in real time</div>
        <h1 className="text-lg font-semibold tracking-tight leading-tight">{greeting()}, {firstName}.</h1>
        <p className="text-xs text-fg-muted mt-0.5">
          {live == null ? "Loading campus…" : live === 0 ? "Quiet right now. Be the first to post." : `${plural(live, "thing")} happening on campus right now.`}
          {shared > 0 && data.data && <span className="text-mint" title={sharedTitle(data.data.counts.sharedBreakdown)}> · {shared} kept in use</span>}
        </p>
      </div>

      <button type="button" onClick={toggleBuses} aria-pressed={showBuses} aria-expanded={showBuses} aria-controls="map-bus-panel" className={cn("absolute z-10 right-3 md:right-4 top-[82px] md:top-[94px] inline-flex h-11 items-center gap-2 rounded-full glass-strong px-4 text-sm font-semibold transition-colors", showBuses ? "text-carolina ring-1 ring-carolina/40" : "text-fg-muted hover:text-fg")}>
        <Bus className="size-4" /> Buses <span aria-hidden className={cn("relative h-5 w-9 rounded-full transition-colors", showBuses ? "bg-carolina" : "bg-fg/20")}><span className={cn("absolute left-0 top-0.5 size-4 rounded-full bg-white shadow-sm transition-transform", showBuses ? "translate-x-[18px]" : "translate-x-0.5")} /></span>
      </button>
      {showBuses && <MapBusPanel selectedId={selectedRouteId} onSelect={selectRoute} onStop={selectStop} onData={setTransitData} onClose={toggleBuses} busesEnabled={busesEnabled} onToggleBuses={() => setBusesEnabled((v) => !v)} show3d={show3d} onToggle3d={() => setShow3d((v) => !v)} onReset={resetBusView} />}

      <button type="button" onClick={() => { if (showBuses) resetBusView(); else handle?.reset(); setSelected(null); }} aria-label="Reset view" title="Reset view"
        className={cn("absolute right-3 md:right-4 bottom-24 md:bottom-6 grid size-10 place-items-center rounded-xl glass-strong text-fg-muted hover:text-fg [&_svg]:size-4", showBuses && "hidden md:grid")}>
        <RotateCcw />
      </button>

      {/* A selected match: which two posts are connected, and where. */}
      {focusMatch && !selected && (
        <aside aria-label="AquaMatch connection" className={cn("absolute z-20 glass-strong overflow-y-auto scrollbar-thin animate-rise",
          "md:right-4 md:bottom-6 md:w-[360px] md:max-h-[60vh] md:rounded-2xl",
          "left-0 right-0 bottom-0 max-h-[70dvh] rounded-t-3xl pb-20 md:pb-0")}>
          <div className="p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="aero-eyebrow !mb-1">AquaMatch</div>
                <h2 className="text-base font-semibold leading-tight">
                  {matchStrength(focusMatch.score)} <span className="text-mint tabular-nums">· {Math.round(focusMatch.score * 100)}%</span>
                </h2>
              </div>
              <button type="button" onClick={closeFocus} aria-label="Close match view" className="rounded-lg p-1.5 text-fg-muted hover:bg-fg/5 hover:text-fg"><X className="size-4" /></button>
            </div>
            <div className="mt-3 space-y-2.5 text-sm">
              <div className="flex gap-2.5">
                <span className="mt-1.5 size-2.5 shrink-0 rounded-full bg-[#0e9fde] ring-4 ring-[#0e9fde]/15" aria-hidden />
                <div className="min-w-0">
                  <Badge tone="carolina">Request</Badge>
                  <div className="mt-1 font-medium leading-snug">{focusMatch.request.title}</div>
                  {getLocation(focusMatch.request.locationId) && <div className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-fg-muted"><MapPin className="size-3" />{getLocation(focusMatch.request.locationId)!.name}</div>}
                </div>
              </div>
              <div className="flex gap-2.5">
                <span className="mt-1.5 size-2.5 shrink-0 rounded-full bg-mint ring-4 ring-mint/15" aria-hidden />
                <div className="min-w-0">
                  <Badge tone="mint">Offer</Badge>
                  <div className="mt-1 font-medium leading-snug">{focusMatch.offer.title}</div>
                  {getLocation(focusMatch.offer.locationId) && <div className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-fg-muted"><MapPin className="size-3" />{getLocation(focusMatch.offer.locationId)!.name}</div>}
                </div>
              </div>
            </div>
            {!focused?.endpoints && <p className="mt-3 text-xs text-fg-muted">One side of this match has no mapped campus location, so there is nothing to draw on the map.</p>}
            <div className="mt-4 flex items-center gap-2">
              <Link href={`/connect?match=${focusMatch.id}`} className="aero-button btn-aero inline-flex h-9 items-center gap-1.5 rounded-xl px-3.5 text-xs font-semibold text-white">
                Open in Connect <ExternalLink className="size-3.5" />
              </Link>
              <Badge tone={focusMatch.status === "completed" ? "mint" : "neutral"}>{focusMatch.status}</Badge>
            </div>
          </div>
        </aside>
      )}

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
