"use client";
// AquaImpact: the sustainability panel on Connect. Every number comes from real completed
// matches in the database — never a projection, a dollar figure, or a carbon guess.
// Demo-content exchanges are counted separately so the real record stays honest.

import Link from "next/link";
import { Leaf, HeartHandshake, CheckCircle2, Users, ArrowRight } from "lucide-react";
import { useLive } from "@/hooks/useLive";
import { sharedTitle, type Breakdown } from "./shared-tally";

type Impact = { completed: number; resolvedRequests: number; peopleHelped: number; demoCompleted: number; breakdown: Breakdown };
type Sync = { counts: { impact?: Impact } };

function Stat({ icon: Icon, n, label }: { icon: typeof Leaf; n: number; label: string }) {
  return (
    <div className="flex items-center gap-2.5 rounded-xl bg-fg/[0.04] px-3 py-2.5">
      <Icon className="size-4 text-mint shrink-0" aria-hidden />
      <div className="min-w-0">
        <div className="text-lg font-bold leading-none tabular-nums">{n}</div>
        <div className="text-[11px] text-fg-muted mt-1 leading-tight">{label}</div>
      </div>
    </div>
  );
}

export function AquaImpact({ className = "" }: { className?: string }) {
  const sync = useLive<Sync>("/api/sync", { interval: 6000, scopes: ["matches", "posts"] });
  const impact = sync.data?.counts.impact;
  if (!impact) return null;
  const { completed, resolvedRequests, peopleHelped, demoCompleted, breakdown } = impact;
  const real = completed - demoCompleted;

  return (
    <section aria-label="AquaImpact" className={`card p-4 ${className}`}>
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold"><Leaf className="size-4 text-mint" /> AquaImpact</h2>
        <Link href="/impact" className="inline-flex items-center gap-1 text-[11px] font-medium text-carolina hover:underline">Full dashboard <ArrowRight className="size-3" /></Link>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        <Stat icon={HeartHandshake} n={completed} label="shared exchanges completed" />
        <Stat icon={CheckCircle2} n={resolvedRequests} label="community requests resolved" />
        <Stat icon={Users} n={peopleHelped} label="people helped" />
      </div>
      <p className="mt-3 text-xs text-fg-muted leading-relaxed">
        Every completed borrow or shared resource keeps useful items circulating across campus
        {breakdown.total > 0 && <span className="text-mint font-medium"> — {sharedTitle(breakdown)}</span>}.
      </p>
      {demoCompleted > 0 && (
        <p className="mt-1.5 text-[11px] text-fg-faint">
          {real === 0 ? "All completed exchanges so far involve demo posts." : `${demoCompleted} of ${completed} completed exchanges involve demo posts.`}
        </p>
      )}
    </section>
  );
}
