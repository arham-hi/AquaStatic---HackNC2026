"use client";

import { useEffect } from "react";
import { Box, Bus, ExternalLink, RotateCcw, X } from "lucide-react";
import { useLive } from "@/hooks/useLive";
import type { TransitData, TransitStop } from "@/lib/services/transit";
import type { Post } from "@/lib/db/schema";
import { timeAgo } from "@/lib/time";
import { cn } from "@/lib/utils";
import { RouteList } from "./route-list";
import { RouteDetail } from "./route-detail";
import { Notices } from "./notices";

export type MapTransitData = TransitData & { notices: Post[]; realtime: { available: false; officialUrl: string } };

export function MapBusPanel({ selectedId, onSelect, onStop, onData, onClose, busesEnabled, onToggleBuses, show3d, onToggle3d, onReset }: {
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onStop: (stop: TransitStop) => void;
  onData: (data: MapTransitData) => void;
  onClose: () => void;
  busesEnabled: boolean;
  onToggleBuses: () => void;
  show3d: boolean;
  onToggle3d: () => void;
  onReset: () => void;
}) {
  // Mount/fetch only while the overlay is enabled.
  const { data, error, loading, refresh } = useLive<MapTransitData>("/api/transit", { interval: 300000, scopes: ["posts"] });
  useEffect(() => { if (data) onData(data); }, [data, onData]);
  const selected = data?.routes.find((r) => r.id === selectedId);
  const stopsById = new Map(data?.stops.map((s) => [s.id, s]) ?? []);

  return (
    <aside id="map-bus-panel" aria-label="Bus routes and stops" className="absolute z-10 left-3 right-3 bottom-24 flex max-h-[46dvh] flex-col overflow-hidden rounded-3xl glass-strong shadow-xl md:left-auto md:bottom-auto md:top-[150px] md:right-4 md:w-[360px] md:max-h-[calc(100dvh-180px)] animate-rise">
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-4 py-3">
        <span className="grid size-9 place-items-center rounded-xl bg-carolina-soft text-carolina"><Bus className="size-5" /></span>
        <div className="min-w-0 flex-1"><h2 className="text-sm font-semibold">Campus buses</h2><p className="text-[11px] text-fg-muted">Routes, stops & demo vehicles</p></div>
        <button type="button" onClick={onReset} title="Reset bus map view" aria-label="Reset bus map view" className="grid size-9 place-items-center rounded-xl hover:bg-fg/5"><RotateCcw className="size-4" /></button>
        <button type="button" onClick={onClose} aria-label="Close bus overlay" className="grid size-9 place-items-center rounded-xl hover:bg-fg/5"><X className="size-4" /></button>
      </div>
      <div className="flex shrink-0 items-center gap-2 px-4 py-2 text-xs">
        <button type="button" onClick={onToggleBuses} aria-pressed={busesEnabled} aria-label={busesEnabled ? "Hide demo 3D buses" : "Show demo 3D buses"} title={busesEnabled ? "Hide demo 3D buses" : "Show demo 3D buses"} className={cn("grid size-9 place-items-center rounded-full hover:bg-fg/5", busesEnabled ? "text-carolina" : "text-fg-muted")}><Bus className="size-5" /></button>
        <span className="flex-1 text-fg-muted">Simulated positions</span>
        <button type="button" onClick={onToggle3d} aria-pressed={show3d} className={cn("inline-flex items-center gap-1.5 rounded-full px-3 py-2 hover:bg-fg/5", show3d ? "text-carolina" : "text-fg-muted")}><Box className="size-3.5" />3D buildings</button>
      </div>
      <div className="min-h-0 overflow-y-auto scrollbar-thin px-4 pb-4">
        {!data && loading && <p role="status" className="py-5 text-sm text-fg-muted animate-pulse">Loading bus routes…</p>}
        {error && <div role="alert" className="mb-3 text-xs text-amber">{data ? "Couldn't refresh bus routes." : "Couldn't load bus routes."} <button type="button" onClick={() => void refresh()} className="font-semibold underline">Retry</button></div>}
        {data && <>
          <p className="mb-3 text-[11px] text-fg-muted">{data.mode === "demo" ? "Demo route geometry — not a real schedule." : `Schedule data · updated ${timeAgo(data.fetchedAt)}`}</p>
          {selected ? <RouteDetail route={selected} stopsById={stopsById} trackingUrl={data.realtime.officialUrl} onClose={() => onSelect(null)} onStop={onStop} /> : <RouteList routes={data.routes} selectedId={selectedId} onSelect={onSelect} />}
          <a href={data.realtime.officialUrl} target="_blank" rel="noopener noreferrer" className="mt-4 inline-flex items-center gap-1 text-xs text-carolina hover:underline">Real-time tracking on mychtransit.org <ExternalLink className="size-3" /></a>
          {data.notices.length > 0 && <div className="mt-4"><Notices notices={data.notices} /></div>}
        </>}
      </div>
    </aside>
  );
}
