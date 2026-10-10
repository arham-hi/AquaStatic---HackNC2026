"use client";

import { Radio } from "lucide-react";
import { Badge, Card, EmptyState, Skeleton } from "@/components/ui/primitives";
import { timeAgo } from "@/lib/time";
import { cn } from "@/lib/utils";
import { FORMATS, type ClientBriefing } from "./formats";

export function History({ briefings, loading, error, selectedId, onSelect }: {
  briefings: ClientBriefing[]; loading: boolean; error: string | null; selectedId: string | null; onSelect: (id: string) => void;
}) {
  return (
    <Card className="p-5 rounded-[20px]">
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="font-semibold tracking-tight">Recent briefings</h2>
        <span className="text-[11px] text-fg-faint">Snapshots · never regenerated</span>
      </div>
      {loading && !briefings.length ? (
        <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-14 rounded-2xl" />)}</div>
      ) : error && !briefings.length ? (
        <p role="alert" className="text-sm text-red">{error}</p>
      ) : !briefings.length ? (
        <EmptyState icon={Radio} title="Generate your first briefing" body="Pick a format above and we'll write one from today's posts, events and alerts." className="py-8" />
      ) : (
        <ul className="space-y-1.5">
          {briefings.map((b) => {
            const m = FORMATS[b.format], active = b.id === selectedId;
            return (
              <li key={b.id}>
                <button type="button" onClick={() => onSelect(b.id)} aria-current={active ? "true" : undefined}
                  className={cn("flex w-full items-center gap-3 rounded-2xl border px-3 py-2.5 text-left transition-all", active ? "border-carolina/60 bg-carolina-soft/50" : "border-transparent hover:bg-fg/4 hover:border-border")}>
                  <span className={cn("grid size-9 shrink-0 place-items-center rounded-xl", active ? "bg-carolina text-white" : "bg-fg/6 text-fg-muted")}><m.icon className="size-4" /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{b.title}</span>
                    <span className="flex items-center gap-1.5 text-[11px] text-fg-muted">
                      <span>{timeAgo(new Date(b.createdAt))}</span><span aria-hidden>·</span><span>{b.wordCount} words</span>
                      {b.includesDemo && <Badge tone="amber" className="px-1.5 py-0 text-[10px]">DEMO</Badge>}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
