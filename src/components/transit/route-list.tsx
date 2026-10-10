"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import type { TransitRoute } from "@/lib/services/transit";
import { Input, EmptyState } from "@/components/ui/primitives";
import { cn, plural } from "@/lib/utils";

export function RouteBadge({ route, className }: { route: TransitRoute; className?: string }) {
  return (
    <span className={cn("inline-grid place-items-center min-w-10 h-8 px-2 rounded-lg text-sm font-bold shadow-sm shrink-0", className)} style={{ background: route.color, color: route.textColor }}>
      {route.shortName}
    </span>
  );
}

export function RouteList({ routes, selectedId, onSelect }: { routes: TransitRoute[]; selectedId: string | null; onSelect: (id: string) => void }) {
  const [q, setQ] = useState("");
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? routes.filter((r) => r.shortName.toLowerCase().includes(s) || r.longName.toLowerCase().includes(s)) : routes;
  }, [routes, q]);

  return (
    <div className="flex flex-col gap-3 min-h-0">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-fg-faint" aria-hidden />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search routes" aria-label="Search routes" className="pl-9" />
      </div>
      <div className="text-xs text-fg-faint px-1">{plural(shown.length, "route")}</div>
      <ul className="flex flex-col gap-1.5 overflow-y-auto scrollbar-thin min-h-0 lg:max-h-[calc(100dvh-330px)] pr-1">
        {shown.map((r) => (
          <li key={r.id}>
            <button type="button" onClick={() => onSelect(r.id)} aria-current={r.id === selectedId}
              className={cn("w-full flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors", r.id === selectedId ? "border-carolina bg-carolina-soft/60 shadow-sm" : "border-transparent hover:bg-fg/5 hover:border-border")}>
              <RouteBadge route={r} />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium truncate">{r.longName || `Route ${r.shortName}`}</span>
                <span className="block text-xs text-fg-muted">{plural(r.headsigns.length, "headsign")} · {plural(r.stopIds.length, "stop")}</span>
              </span>
            </button>
          </li>
        ))}
        {!shown.length && <li><EmptyState title="No routes match" body="Try a route number or a street name." className="py-6" /></li>}
      </ul>
    </div>
  );
}
