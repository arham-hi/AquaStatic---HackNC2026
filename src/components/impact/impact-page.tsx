"use client";
// AquaImpact: the community's live positive-impact dashboard. Every number on this page is
// derived from completed matches in the database — demo records are labeled, never hidden or inflated.

import { Gift, Leaf, HeartHandshake, Recycle, Users, ArrowRight, HandHelping } from "lucide-react";
import Link from "next/link";
import { useLive } from "@/hooks/useLive";
import { Page } from "@/components/shell/app-shell";
import { EmptyState, Skeleton } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { categoryMeta } from "@/lib/categories";
import { fmtTime, timeAgo } from "@/lib/time";
import { sharedTitle } from "@/components/feed/shared-tally";
import { cn } from "@/lib/utils";
import type { ImpactDashboard } from "@/lib/services/impact";

function StatCard({ icon: Icon, n, label, sub, tone }: { icon: typeof Leaf; n: number; label: string; sub?: string; tone: "mint" | "carolina" }) {
  return (
    <div className="card relative overflow-hidden p-4">
      <div className={cn("absolute -right-5 -top-5 size-20 rounded-full blur-2xl", tone === "mint" ? "bg-mint-soft" : "bg-carolina-soft")} aria-hidden />
      <div className="relative">
        <div className="flex items-center gap-2 text-xs font-semibold text-fg-muted">
          <Icon className={cn("size-4", tone === "mint" ? "text-mint" : "text-carolina")} aria-hidden />
          {label}
        </div>
        <div className="mt-2 text-3xl font-bold tracking-tight tabular-nums">{n}</div>
        <div className="mt-1 flex min-h-4 items-center gap-2 text-[11px] text-fg-muted">
          {sub && <span className="truncate">{sub}</span>}
        </div>
      </div>
    </div>
  );
}

function ActivityChart({ series }: { series: { t: number; count: number }[] }) {
  const max = Math.max(1, ...series.map((s) => s.count));
  const total = series.reduce((s, p) => s + p.count, 0);
  return (
    <section className="card p-4" aria-label="Completed connections over the last 24 hours">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Last 24 hours</h3>
        <span className="text-[11px] text-fg-faint">{total} completed</span>
      </div>
      {total === 0 ? (
        <p className="mt-3 text-xs text-fg-muted">No completed connections yet today — the first one will show up here.</p>
      ) : (
        <div className="mt-4 flex h-24 items-end gap-[3px]" role="img" aria-label={`${total} connections completed in the last 24 hours`}>
          {series.map((s) => (
            <div key={s.t} className="group relative flex-1">
              <div
                className={cn("w-full rounded-t-sm transition-all", s.count > 0 ? "bg-gradient-to-t from-carolina/70 to-mint" : "bg-fg/8")}
                style={{ height: `${Math.max(3, (s.count / max) * 88)}px` }}
                title={`${fmtTime(s.t)} · ${s.count} completed`}
              />
            </div>
          ))}
        </div>
      )}
      {total > 0 && (
        <div className="mt-1.5 flex justify-between text-[10px] text-fg-faint tabular-nums">
          <span>{fmtTime(series[0].t)}</span>
          <span>{fmtTime(series[series.length - 1].t)}</span>
        </div>
      )}
    </section>
  );
}

export function ImpactPage() {
  const live = useLive<ImpactDashboard>("/api/impact", { interval: 5000, scopes: ["matches", "posts"] });
  const d = live.data;

  return (
    <Page title="AquaImpact" subtitle="Small campus actions. Real community impact.">
      <div className="mx-auto max-w-3xl space-y-4">
        {live.loading && !d ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}</div>
        ) : !d || d.completed === 0 ? (
          <EmptyState
            icon={Leaf}
            title="No completed exchanges yet"
            body="When two students accept a match and mark it complete, it shows up here — counted once, verified by the community record."
            action={<Link href="/connect"><Button><HandHelping /> Find someone to help</Button></Link>}
          />
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatCard icon={Gift} n={d.resourcesShared.total} label="Resources shared" sub={d.breakdown.total > 0 ? sharedTitle(d.breakdown) : "completed exchanges"} tone="mint" />
              <StatCard icon={Users} n={d.peopleHelped.total} label="Students helped" sub={`${d.helpResolved.total} requests resolved`} tone="carolina" />
              <StatCard icon={HeartHandshake} n={d.connections.total} label="Connections made" sub="unique pairs, both confirmed" tone="carolina" />
              <StatCard icon={Recycle} n={d.reuseActions.total} label="Items kept in use" sub="borrowed, rehomed or returned" tone="mint" />
            </div>

            <ActivityChart series={d.series} />

            <section className="card p-4">
              <h3 className="text-sm font-semibold">Recent impact</h3>
              {d.recent.length === 0 ? (
                <p className="mt-3 text-xs text-fg-muted">Nothing completed yet.</p>
              ) : (
                <ul className="mt-3 space-y-2.5">
                  {d.recent.map((e) => {
                    const meta = categoryMeta(e.category);
                    const Icon = meta.icon;
                    return (
                      <li key={e.id} className="flex items-start gap-3 rounded-xl bg-fg/[0.04] px-3 py-2.5">
                        <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full text-white" style={{ background: meta.color }} aria-hidden>
                          <Icon className="size-4" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium leading-snug">
                            {e.requestTitle} <ArrowRight className="inline size-3 text-fg-faint" aria-hidden /> {e.offerTitle}
                          </div>
                          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-fg-muted">
                            {e.requestLocation && e.offerLocation ? (
                              <span>{e.requestLocation} ↔ {e.offerLocation}</span>
                            ) : (
                              <span>{meta.label}</span>
                            )}
                            <span className="text-fg-faint">· {timeAgo(e.at)}</span>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            <p className="px-1 text-[11px] leading-relaxed text-fg-faint">
              Every number comes from exchanges both participants confirmed in Aqua Static — never an estimate,
              a dollar figure, or a carbon guess.
            </p>
          </>
        )}
        {live.error && !d && <p className="text-xs text-red">Couldn&apos;t load impact data: {live.error}</p>}
      </div>
    </Page>
  );
}
