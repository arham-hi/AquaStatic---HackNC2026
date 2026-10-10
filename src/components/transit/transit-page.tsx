"use client";
// Transit page: status banner, map + route list/detail, service notices. One fetch of /api/transit (~1-2 MB), refreshed every 5 min.

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Bus, ExternalLink, Radio } from "lucide-react";
import { useLive } from "@/hooks/useLive";
import { useUI } from "@/components/shell/providers";
import type { TransitData, TransitStop } from "@/lib/services/transit";
import type { Post } from "@/lib/db/schema";
import { EmptyState, Skeleton } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { timeAgo } from "@/lib/time";
import { cn } from "@/lib/utils";
import { TransitMap, type StopFocus } from "./transit-map";
import { RouteList } from "./route-list";
import { RouteDetail } from "./route-detail";
import { Notices } from "./notices";

type Resp = TransitData & { notices: Post[]; realtime: { available: false; officialUrl: string } };
const MAP_H = "h-[60vh] md:h-[calc(100dvh-220px)] min-h-[360px]";

export function TransitPage() {
  const { theme } = useUI();
  const { data, error, loading, refresh } = useLive<Resp>("/api/transit", { interval: 300000, scopes: ["posts"] });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [focus, setFocus] = useState<StopFocus>(null);
  const panel = useRef<HTMLDivElement>(null);

  const routes = useMemo(() => data?.routes ?? [], [data]);
  const stops = useMemo(() => data?.stops ?? [], [data]);
  const stopsById = useMemo(() => new Map(stops.map((s) => [s.id, s])), [stops]);
  const selected = routes.find((r) => r.id === selectedId) ?? null;

  useEffect(() => { if (selectedId) panel.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }); }, [selectedId]);

  if (!data && loading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-12 rounded-2xl" />
        <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
          <div className="flex flex-col gap-2 order-2 lg:order-1">{Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-14 rounded-xl" />)}</div>
          <Skeleton className={cn("rounded-2xl order-1 lg:order-2", MAP_H)} />
        </div>
      </div>
    );
  }
  if (!data) {
    return <EmptyState icon={AlertTriangle} title="Couldn't load transit data" body={error ?? "Unknown error"} action={<Button onClick={() => void refresh()}>Retry</Button>} />;
  }

  const demo = data.mode === "demo";
  const onStop = (stop: TransitStop) => setFocus({ stop, nonce: Date.now() });

  return (
    <div className="flex flex-col gap-5">
      <p className={cn("text-sm text-fg-muted flex flex-wrap items-center gap-x-2 gap-y-1", demo && "text-amber")}>
        {demo ? <><AlertTriangle className="size-4 shrink-0" /> DEMO overlay — approximate geometry, not a real schedule.</> : <><Bus className="size-4 text-carolina shrink-0" aria-hidden /> {routes.length} Chapel Hill Transit routes · schedule data, updated {timeAgo(data.fetchedAt)}.</>}
        <a href={data.realtime.officialUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-carolina hover:underline"><Radio className="size-3.5" /> Live buses on mychtransit.org <ExternalLink className="size-3" /></a>
      </p>

      <div className="grid gap-4 lg:grid-cols-[360px_minmax(0,1fr)] items-start">
        <div ref={panel} className="glass rounded-2xl p-4 order-2 lg:order-1 min-w-0 scroll-mt-20">
          {selected ? (
            <RouteDetail route={selected} stopsById={stopsById} trackingUrl={data.realtime.officialUrl} onClose={() => setSelectedId(null)} onStop={onStop} />
          ) : (
            <RouteList routes={routes} selectedId={selectedId} onSelect={setSelectedId} />
          )}
        </div>
        <TransitMap theme={theme} routes={routes} stops={stops} selectedId={selectedId} onSelect={setSelectedId} focus={focus} className={cn("order-1 lg:order-2 min-w-0", MAP_H)} />
      </div>

      {data.notices.length > 0 && <Notices notices={data.notices} />}
    </div>
  );
}
