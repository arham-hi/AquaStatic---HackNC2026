"use client";

import { useMemo } from "react";
import { ArrowLeft, ExternalLink, FileText, MapPin, Radio } from "lucide-react";
import type { TransitRoute, TransitStop } from "@/lib/services/transit";
import { Badge } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { plural } from "@/lib/utils";
import { RouteBadge } from "./route-list";

type Props = { route: TransitRoute; stopsById: Map<string, TransitStop>; trackingUrl: string; onClose: () => void; onStop: (s: TransitStop) => void };

export function RouteDetail({ route, stopsById, trackingUrl, onClose, onStop }: Props) {
  const stops = useMemo(
    () => route.stopIds.map((id) => stopsById.get(id)).filter((s): s is TransitStop => !!s).sort((a, b) => a.name.localeCompare(b.name)),
    [route, stopsById],
  );
  return (
    <div className="flex flex-col gap-4 min-h-0 animate-rise">
      <Button variant="ghost" size="sm" className="self-start -ml-2" onClick={onClose}><ArrowLeft /> All routes</Button>
      <div className="flex items-start gap-3">
        <RouteBadge route={route} className="h-10 min-w-12 text-base" />
        <div className="min-w-0">
          <h2 className="text-lg font-semibold leading-tight tracking-tight">{route.longName || `Route ${route.shortName}`}</h2>
          <p className="text-xs text-fg-muted mt-1">{plural(stops.length, "stop")} · {plural(route.headsigns.length, "headsign")}</p>
        </div>
      </div>
      {route.headsigns.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {route.headsigns.map((h) => <Badge key={h} tone="carolina" className="whitespace-normal">{h}</Badge>)}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {route.url && (
          <Button asChild variant="secondary" size="sm"><a href={route.url} target="_blank" rel="noopener noreferrer"><FileText /> Schedule (PDF) <ExternalLink className="opacity-60" /></a></Button>
        )}
        <Button asChild variant="secondary" size="sm"><a href={trackingUrl} target="_blank" rel="noopener noreferrer"><Radio /> Track live on mychtransit.org <ExternalLink className="opacity-60" /></a></Button>
      </div>
      <div className="min-h-0 flex flex-col gap-2">
        <div className="text-xs font-semibold uppercase tracking-wide text-fg-muted">Stops (A–Z)</div>
        <ul className="flex flex-col overflow-y-auto scrollbar-thin min-h-0 max-h-[50vh] lg:max-h-[calc(100dvh-560px)] rounded-xl border border-border divide-y divide-border bg-bg-elev">
          {stops.map((s) => (
            <li key={s.id}>
              <button type="button" onClick={() => onStop(s)} className="w-full flex items-center gap-2.5 px-3 py-2 text-left text-sm hover:bg-carolina-soft/50 transition-colors">
                <MapPin className="size-4 text-fg-faint shrink-0" aria-hidden />
                <span className="flex-1 min-w-0 truncate">{s.name}</span>
                <span className="text-[11px] text-fg-faint tabular-nums">{s.code}</span>
              </button>
            </li>
          ))}
          {!stops.length && <li className="px-3 py-4 text-sm text-fg-muted">No stop list in the feed for this route.</li>}
        </ul>
      </div>
    </div>
  );
}
