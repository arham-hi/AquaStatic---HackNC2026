"use client";

import { Megaphone, ExternalLink } from "lucide-react";
import type { Post } from "@/lib/db/schema";
import { OFFICIAL_ROUTES_URL } from "@/lib/constants";
import { Badge, Card, EmptyState } from "@/components/ui/primitives";
import { timeAgo, timeUntil } from "@/lib/time";

export function Notices({ notices }: { notices: Post[] }) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold tracking-tight flex items-center gap-2"><Megaphone className="size-5 text-carolina" aria-hidden /> Service notices</h2>
        <a href={OFFICIAL_ROUTES_URL} target="_blank" rel="noopener noreferrer" className="text-xs text-fg-muted hover:text-carolina inline-flex items-center gap-1">
          Official notices: Chapel Hill Transit <ExternalLink className="size-3" />
        </a>
      </div>
      {notices.length ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {notices.map((n) => (
            <Card key={n.id} className="flex flex-col gap-1.5 animate-rise">
              <div className="flex items-start justify-between gap-2">
                <div className="font-medium leading-snug">{n.title}</div>
                {n.isDemo && <Badge tone="amber">DEMO</Badge>}
              </div>
              <p className="text-sm text-fg-muted">{n.summary}</p>
              <div className="text-[11px] text-fg-faint mt-auto pt-1">
                {timeAgo(n.createdAt)}{n.expiresAt ? ` · ${timeUntil(n.expiresAt)}` : ""}
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState icon={Megaphone} title="No service notices posted." body="Official alerts are on the Chapel Hill Transit site." />
      )}
    </section>
  );
}
