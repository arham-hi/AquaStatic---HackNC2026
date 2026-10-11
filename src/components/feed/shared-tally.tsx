"use client";
// "Kept in use" tally: a count of completed connections where something was shared instead of bought.
// Counts of things only. Never dollars, never carbon.

import { Leaf } from "lucide-react";
import { useLive } from "@/hooks/useLive";

export type Breakdown = { total: number; borrowed: number; rehomed: number; returned: number; rides: number; food: number };
type Sync = { counts: { shared: number; sharedBreakdown: Breakdown } };

export function sharedTitle(b: Breakdown): string {
  const parts = [
    b.borrowed && `${b.borrowed} borrowed`, b.rehomed && `${b.rehomed} rehomed`, b.returned && `${b.returned} returned to owners`,
    b.rides && `${b.rides} ride${b.rides === 1 ? "" : "s"} shared`, b.food && `${b.food} food pickup${b.food === 1 ? "" : "s"}`,
  ].filter(Boolean) as string[];
  return parts.join(" · ") || "Nothing completed yet";
}

export function SharedTally({ className = "" }: { className?: string }) {
  const sync = useLive<Sync>("/api/sync", { interval: 6000, scopes: ["matches"] });
  const shared = sync.data?.counts.shared ?? 0;
  const b = sync.data?.counts.sharedBreakdown;
  return (
    <p className={`flex items-center gap-2 text-sm text-mint ${className}`} title={b ? sharedTitle(b) : undefined}>
      <Leaf className="size-4 shrink-0" />
      <span>
        {shared === 0
          ? "Every completed borrow, giveaway, return or shared ride here keeps something in use instead of buying new."
          : <>{shared} {shared === 1 ? "thing" : "things"} kept in use through Aqua Static{b ? <span className="text-fg-faint"> · {sharedTitle(b)}</span> : null}</>}
      </span>
    </p>
  );
}
