"use client";
// Home: the living campus map plus everything floating over it.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Plus, Minus, RotateCcw, Compass, Box, Bus, LocateFixed, Layers, Search, X, ChevronUp, Sparkles, HeartHandshake, Flame } from "lucide-react";
import { useLive } from "@/hooks/useLive";
import { useSession, useUI } from "@/components/shell/providers";
import { TopBar } from "@/components/shell/topbar";
import { Button } from "@/components/ui/button";
import { Chip, Badge, Skeleton, EmptyState } from "@/components/ui/primitives";
import { FeedCard, type FeedItemWithSaved } from "@/components/feed/feed-card";
import { PostDetail } from "@/components/posts/post-detail";
import { CATEGORIES } from "@/lib/categories";
import { greeting, HOUR, fmtDay } from "@/lib/time";
import { getLocation, searchLocations, LOCATIONS, distanceMeters, type CampusLocation } from "@/lib/locations";
import { cn, plural } from "@/lib/utils";
import type { FeedItem } from "@/lib/services/feed";
import type { PostCategory } from "@/lib/db/schema";
import type { MapHandle, ConnectionLine } from "./campus-map";
import type { TransitData } from "@/lib/services/transit";

const CampusMap = dynamic(() => import("./campus-map").then((m) => m.CampusMap), { ssr: false, loading: () => <div className="absolute inset-0 grid place-items-center bg-bg"><div className="text-sm text-fg-muted animate-pulse">Loading Chapel Hill…</div></div> });

type MarkersResponse = { markers: FeedItem[]; counts: { live: number; requests: number; offers: number; alerts: number; last24h: number } };
type RecentMatch = { id: string; status: string; createdAt: string; request: { id: string; locationId: string | null; title: string }; offer: { id: string; locationId: string | null; title: string } };

const RECENCY = [["recent", "Live"], ["today", "Today"], ["upcoming", "Upcoming"]] as const;

export function HomeMap() {
  const { theme, mapFocus, openAssistant, openCreate } = useUI();
  const { user } = useSession();
  const router = useRouter();
  const params = useSearchParams();
  const data = useLive<MarkersResponse>("/api/map/markers", { interval: 3000, scopes: ["posts", "matches", "sources"] });
  const recent = useLive<{ matches: RecentMatch[] }>("/api/matches?scope=recent", { interval: 4000, scopes: ["matches"] });
  const [handle, setHandle] = useState<MapHandle | null>(null);
  const [selected, setSelected] = useState<FeedItem | null>(null);
  const [cats, setCats] = useState<Set<PostCategory>>(new Set());
  const [recency, setRecency] = useState<"recent" | "today" | "upcoming">("recent");
  const [q, setQ] = useState("");
  const [show3d, setShow3d] = useState(true);
  const [showTransit, setShowTransit] = useState(false);
  const [transit, setTransit] = useState<TransitData | null>(null);
  const [me, setMe] = useState<{ lat: number; lng: number } | null>(null);
  const [nearOnly, setNearOnly] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [locQ, setLocQ] = useState("");
  const [locOpen, setLocOpen] = useState(false);
  const knownMatches = useRef<Set<string> | null>(null);
  const [flash, setFlash] = useState<ConnectionLine[]>([]);

  // ---- filtering ----
  const now = Date.now();
  const items = useMemo(() => {
    let list = data.data?.markers ?? [];
    if (cats.size) list = list.filter((m) => cats.has(m.category));
    if (recency === "today") list = list.filter((m) => (m.startsAt ?? m.at) < now + 18 * HOUR && (m.endsAt ?? m.startsAt ?? m.at) > now - 6 * HOUR);
    if (recency === "upcoming") list = list.filter((m) => m.startsAt != null && m.startsAt > now);
    if (q.trim()) { const s = q.toLowerCase(); list = list.filter((m) => `${m.title} ${m.summary} ${m.locationName ?? ""} ${m.category}`.toLowerCase().includes(s)); }
    if (nearOnly && me) list = list.filter((m) => m.lat != null && distanceMeters(me.lat, me.lng, m.lat, m.lng!) < 500);
    return list;
  }, [data.data, cats, recency, q, nearOnly, me, now]);

  const counts = data.data?.counts;
  const visibleCounts = useMemo(() => ({ requests: items.filter((i) => i.type === "request").length, offers: items.filter((i) => i.type === "offer").length, events: items.filter((i) => i.type === "event").length, alerts: items.filter((i) => i.type === "alert").length }), [items]);

  // ---- focus requests from elsewhere (assistant, feed cards, deep links) ----
  useEffect(() => {
    if (!handle || !mapFocus) return;
    handle.flyTo(mapFocus.lng, mapFocus.lat, 17.2);
    if (mapFocus.itemId) {
      const it = data.data?.markers.find((m) => m.id === mapFocus.itemId);
      if (it) setSelected(it);
    }
  }, [mapFocus, handle]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const item = params.get("item");
    if (item && data.data && handle) {
      const it = data.data.markers.find((m) => m.id === item);
      if (it && it.lat != null) { setSelected(it); handle.flyTo(it.lng!, it.lat, 17.2); }
    }
  }, [params, data.data, handle]);

  // ---- transit overlay ----
  useEffect(() => {
    if (!showTransit || transit) return;
    fetch("/api/transit").then((r) => r.json()).then(setTransit).catch(() => toast.error("Could not load transit data"));
  }, [showTransit, transit]);

  // ---- match connection animation ----
  const connections = useMemo<ConnectionLine[]>(() => {
    const ms = recent.data?.matches ?? [];
    const fresh = ms.filter((m) => Date.now() - new Date(m.createdAt).getTime() < 3 * 60_000);
    return [...fresh, ...flash.map(() => null)].filter(Boolean).flatMap((m) => {
      const a = getLocation(m!.request.locationId), b = getLocation(m!.offer.locationId);
      if (!a || !b) return [];
      return [{ id: m!.id, from: [a.lng, a.lat] as [number, number], to: [b.lng, b.lat] as [number, number] }];
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

  // ---- geolocation (explicit user action only) ----
  const locate = useCallback(() => {
    if (!navigator.geolocation) return toast.error("Geolocation is not available in this browser");
    navigator.geolocation.getCurrentPosition((p) => {
      const loc = { lat: p.coords.latitude, lng: p.coords.longitude };
      if (distanceMeters(loc.lat, loc.lng, 35.9107, -79.0505) > 6000) { toast.message("You're away from campus", { description: "Showing the campus center instead." }); handle?.reset(); return; }
      setMe(loc); setNearOnly(true); handle?.flyTo(loc.lng, loc.lat, 16.5);
      toast.success("Showing activity within 500 m of you. Your location is never shared.");
    }, () => toast.error("Location permission was denied"), { enableHighAccuracy: true, timeout: 8000 });
  }, [handle]);

  const goTo = (l: CampusLocation) => { handle?.flyTo(l.lng, l.lat, 17.3); setLocQ(""); setLocOpen(false); };
  const locResults = useMemo(() => (locQ ? searchLocations(locQ, 6) : LOCATIONS.filter((l) => ["davis-library", "wilson-library", "the-pit", "carolina-union", "polk-place", "franklin-street", "kenan-stadium", "student-union-transit"].includes(l.id))), [locQ]);
  const select = (it: FeedItem | null) => { setSelected(it); if (it?.lat != null) handle?.flyTo(it.lng!, it.lat, Math.max(16.8, handle.getMap()?.getZoom() ?? 16.8)); if (it) setSheetOpen(true); };
  const toggleCat = (c: PostCategory) => setCats((s) => { const n = new Set(s); if (n.has(c)) n.delete(c); else n.add(c); return n; });

  return (
    <div className="relative h-dvh w-full overflow-hidden">
      <CampusMap theme={theme} markers={items} selectedId={selected?.id ?? null} onSelect={select} show3d={show3d}
        transit={showTransit && transit ? { routes: transit.routes, stops: transit.stops, selectedRouteId: null } : null}
        connections={connections} onReady={setHandle} userLocation={me} className="absolute inset-0" />

      <TopBar overlay />

      {/* Status card */}
      <section aria-label="Campus status" className="absolute left-3 right-3 md:left-4 md:right-auto top-16 md:top-[70px] md:w-[360px] glass-strong rounded-2xl p-4 animate-rise">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-lg md:text-xl font-semibold tracking-tight leading-tight">{greeting()}, {user ? user.displayName.replace(/ \(demo\)$/, "").split(" ")[0] : "Carolina"}.</h1>
            <p className="text-sm text-fg-muted mt-0.5">Explore what&apos;s happening around you · {fmtDay(Date.now())}</p>
          </div>
          <Button size="sm" variant="primary" onClick={() => openAssistant()} className="hidden sm:inline-flex"><Sparkles /> Ask</Button>
        </div>
        {counts ? (
          <dl className="mt-3 grid grid-cols-4 gap-2 text-center">
            {[["Live", counts.live], ["Requests", counts.requests], ["Offers", counts.offers], ["Alerts", counts.alerts]].map(([l, v]) => (
              <div key={l} className="rounded-xl bg-fg/[0.04] py-1.5"><dd className="text-lg font-semibold tabular-nums leading-tight">{v}</dd><dt className="text-[10px] uppercase tracking-wide text-fg-faint">{l}</dt></div>
            ))}
          </dl>
        ) : <div className="mt-3 grid grid-cols-4 gap-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-12 rounded-xl" />)}</div>}
        <div className="mt-3 flex gap-1.5 overflow-x-auto no-scrollbar -mx-1 px-1">
          {RECENCY.map(([v, l]) => <Chip key={v} active={recency === v} onClick={() => setRecency(v)}>{l}</Chip>)}
          <span className="w-px bg-border mx-0.5 shrink-0" />
          {(Object.values(CATEGORIES) as (typeof CATEGORIES)[PostCategory][]).filter((c) => c.id !== "other" && c.id !== "news").map((c) => (
            <Chip key={c.id} active={cats.has(c.id)} onClick={() => toggleCat(c.id)} style={cats.has(c.id) ? { background: c.color, borderColor: c.color } : undefined}><c.icon className="size-3.5" />{c.label}</Chip>
          ))}
          {cats.size > 0 && <Chip onClick={() => setCats(new Set())}><X className="size-3" /> Clear</Chip>}
        </div>
      </section>

      {/* Location jump + search */}
      <div className="absolute left-3 md:left-4 top-[calc(4rem+196px)] md:top-[290px] md:w-[360px] hidden md:block">
        <div className="glass-strong rounded-2xl p-2 flex items-center gap-2">
          <Search className="size-4 text-fg-faint ml-1" />
          <input value={locQ} onChange={(e) => { setLocQ(e.target.value); setLocOpen(true); }} onFocus={() => setLocOpen(true)} onBlur={() => setTimeout(() => setLocOpen(false), 150)} placeholder="Jump to a place · Davis, the Pit, Franklin…" aria-label="Search campus locations" className="flex-1 bg-transparent text-sm outline-none placeholder:text-fg-faint min-w-0" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter posts" aria-label="Filter posts" className="w-24 bg-fg/5 rounded-lg px-2 h-7 text-xs outline-none placeholder:text-fg-faint" />
        </div>
        {locOpen && (
          <ul className="mt-1.5 glass-strong rounded-2xl p-1.5 flex flex-wrap gap-1 animate-rise" role="listbox">
            {locResults.map((l) => <li key={l.id}><button type="button" onMouseDown={() => goTo(l)} className="rounded-lg px-2.5 py-1 text-xs hover:bg-carolina-soft/60">{l.name}</button></li>)}
          </ul>
        )}
      </div>

      {/* Map controls */}
      <div className="absolute right-3 md:right-[404px] bottom-24 md:bottom-6 flex flex-col gap-1.5" role="toolbar" aria-label="Map controls">
        <Ctl label="Zoom in" onClick={() => handle?.zoomIn()}><Plus /></Ctl>
        <Ctl label="Zoom out" onClick={() => handle?.zoomOut()}><Minus /></Ctl>
        <Ctl label="Tilt" onClick={() => { const p = handle?.getMap()?.getPitch() ?? 0; handle?.setPitch(p > 30 ? 0 : 60); }}><Layers /></Ctl>
        <Ctl label="Rotate" onClick={() => handle?.rotate(45)}><Compass /></Ctl>
        <Ctl label={show3d ? "Hide 3D buildings" : "Show 3D buildings"} active={show3d} onClick={() => setShow3d((v) => !v)}><Box /></Ctl>
        <Ctl label={showTransit ? "Hide bus routes" : "Show bus routes"} active={showTransit} onClick={() => setShowTransit((v) => !v)}><Bus /></Ctl>
        <Ctl label="Find me (never shared)" active={nearOnly} onClick={() => (nearOnly ? (setNearOnly(false), setMe(null)) : locate())}><LocateFixed /></Ctl>
        <Ctl label="Reset view" onClick={() => { handle?.reset(); setSelected(null); }}><RotateCcw /></Ctl>
      </div>

      {showTransit && transit && (
        <div className="absolute left-3 md:left-4 bottom-24 md:bottom-6 glass-strong rounded-xl px-3 py-2 text-xs text-fg-muted flex items-center gap-2">
          <Bus className="size-3.5 text-amber" /> {transit.mode === "gtfs" ? `Chapel Hill Transit schedule routes (${transit.routes.length})` : "DEMO transit overlay"} · <a className="text-carolina hover:underline" href="/transit">details</a>
        </div>
      )}

      {/* Right activity panel (desktop) / bottom sheet (mobile) */}
      <aside aria-label="Activity" className={cn("absolute z-20 flex flex-col glass-strong transition-transform duration-300",
        "md:left-auto md:right-4 md:top-[70px] md:bottom-6 md:w-[372px] md:rounded-2xl md:rounded-b-2xl md:max-h-none md:pb-0 md:translate-y-0",
        "left-0 right-0 bottom-0 rounded-t-3xl max-h-[72dvh] pb-16", sheetOpen ? "translate-y-0" : "translate-y-[calc(100%-56px-4rem)] md:translate-y-0")}>
        <button type="button" onClick={() => setSheetOpen((v) => !v)} className="md:hidden flex items-center justify-center gap-2 h-14 w-full text-sm font-medium" aria-expanded={sheetOpen}>
          <span className="h-1 w-10 rounded-full bg-fg/20 absolute top-2" />
          <ChevronUp className={cn("size-4 transition-transform", sheetOpen && "rotate-180")} /> {selected ? "Details" : `${plural(items.length, "thing")} happening`}
        </button>
        {selected ? (
          <div className="flex-1 overflow-y-auto scrollbar-thin p-4"><PostDetail item={selected} onClose={() => setSelected(null)} /></div>
        ) : (
          <>
            <div className="px-4 pt-4 pb-2 hidden md:block">
              <div className="flex items-center justify-between"><h2 className="font-semibold">Around campus</h2><span className="text-xs text-fg-faint tabular-nums">{items.length} shown</span></div>
              <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
                <Badge tone="carolina">{visibleCounts.requests} requests</Badge><Badge tone="mint">{visibleCounts.offers} offers</Badge><Badge>{visibleCounts.events} events</Badge>{visibleCounts.alerts > 0 && <Badge tone="red"><Flame className="size-3" />{visibleCounts.alerts} alerts</Badge>}
              </div>
            </div>
            <div className="flex-1 overflow-y-auto scrollbar-thin px-3 pb-3 space-y-2">
              {data.loading && !data.data ? Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />) : items.length === 0 ? (
                <EmptyState title="Nothing here yet" body={nearOnly ? "No activity within 500 m. Zoom out or clear the filter." : cats.size || q ? "No posts match these filters." : "Be the first to post what's happening around you."} action={<Button size="sm" onClick={() => openCreate()}><Plus /> Post an update</Button>} className="mt-2" />
              ) : items.slice(0, 80).map((it) => <FeedCard key={it.id} item={it as FeedItemWithSaved} compact onSelect={select} selected={selected === it} />)}
            </div>
            {data.error && <div className="px-4 py-2 text-xs text-red border-t border-border">Couldn&apos;t refresh: {data.error}</div>}
          </>
        )}
      </aside>
    </div>
  );
}

function Ctl({ label, onClick, children, active }: { label: string; onClick: () => void; children: React.ReactNode; active?: boolean }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} title={label} aria-pressed={active} className={cn("grid size-10 place-items-center rounded-xl glass-strong text-fg-muted hover:text-fg transition-colors [&_svg]:size-4", active && "!bg-carolina text-white hover:text-white")}>{children}</button>
  );
}
