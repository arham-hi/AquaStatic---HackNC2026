"use client";

import { toast } from "sonner";
import { Clock, MapPin } from "lucide-react";
import { categoryMeta, TYPE_META } from "@/lib/categories";
import { fmtDateTime, timeAgo } from "@/lib/time";
import { api } from "@/lib/client";
import { useSession } from "@/components/shell/providers";
import { Badge } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";
import type { FeedItem } from "@/lib/services/feed";

export type FeedItemWithSaved = FeedItem & { saved?: boolean };

/** One quiet label: the type for community posts, the source for official items, DEMO when simulated. */
export function TrustBadge({ item }: { item: Pick<FeedItem, "trust" | "sourceStatus" | "sourceLabel"> }) {
  if (item.trust === "demo") return <Badge tone="amber">DEMO</Badge>;
  if (item.trust === "official") return <Badge tone="mint">{item.sourceLabel}</Badge>;
  return null;
}

export function TypeBadge({ type }: { type: string }) {
  const m = TYPE_META[type];
  if (!m) return null;
  return <Badge className={m.tone}><m.icon className="size-3" />{m.label}</Badge>;
}

export function useSaveToggle() {
  const { ensureUser } = useSession();
  return async (item: FeedItem, onDone?: (saved: boolean) => void) => {
    try {
      await ensureUser();
      const r = await api.post<{ saved: boolean }>("/api/bookmarks", { itemType: item.kind === "post" ? "post" : "external", itemId: item.refId });
      toast.success(r.saved ? "Saved" : "Removed from saved");
      onDone?.(r.saved);
    } catch (e) { toast.error((e as Error).message); }
  };
}

export async function shareItem(item: FeedItem) {
  const url = item.url ?? `${location.origin}${item.href}`;
  try {
    if (navigator.share) await navigator.share({ title: item.title, text: item.summary, url });
    else { await navigator.clipboard.writeText(url); toast.success("Link copied"); }
  } catch { /* user cancelled */ }
}

/** A calm card: icon, one label, title, one line of context. Actions live in the detail view. */
export function FeedCard({ item, onSelect, selected, compact }: { item: FeedItemWithSaved; onSelect?: (item: FeedItem) => void; selected?: boolean; compact?: boolean; onSavedChange?: (saved: boolean) => void }) {
  const meta = categoryMeta(item.category);
  const Icon = meta.icon;
  const when = item.startsAt && item.startsAt > Date.now() ? fmtDateTime(item.startsAt) : timeAgo(item.at);
  const who = item.kind === "post" && item.authorName ? item.authorName.replace(/ \(demo\)$/, "") : null;
  return (
    <article onClick={() => onSelect?.(item)} role={onSelect ? "button" : undefined} tabIndex={onSelect ? 0 : undefined}
      onKeyDown={(e) => { if (onSelect && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); onSelect(item); } }}
      className={cn("card flex items-start gap-3 cursor-pointer transition-shadow hover:shadow-md", compact ? "p-3" : "p-4", selected && "ring-2 ring-carolina/50", item.type === "alert" && item.urgency === "urgent" && "border-red/40")}>
      <div className="shrink-0 grid size-10 place-items-center rounded-xl text-white" style={{ background: meta.color }}><Icon className="size-5" /></div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 mb-1"><TypeBadge type={item.type} /><TrustBadge item={item} /></div>
        <h3 className={cn("font-semibold leading-snug", compact ? "text-sm" : "text-[15px]")}>{item.title}</h3>
        {!compact && item.summary && item.summary !== item.title && <p className="text-sm text-fg-muted mt-1 line-clamp-1">{item.summary}</p>}
        <div className="mt-1.5 flex items-center gap-3 text-xs text-fg-faint">
          <span className="inline-flex items-center gap-1"><Clock className="size-3" />{when}</span>
          {item.locationName && <span className="inline-flex items-center gap-1 truncate"><MapPin className="size-3" />{item.locationName}</span>}
          {who && <span className="truncate">{who}</span>}
        </div>
      </div>
    </article>
  );
}

export function FeedSkeleton({ n = 4 }: { n?: number }) {
  return <div className="space-y-3">{Array.from({ length: n }).map((_, i) => <div key={i} className="card p-4 flex gap-3"><div className="skeleton size-10 rounded-xl" /><div className="flex-1 space-y-2"><div className="skeleton h-3 w-24" /><div className="skeleton h-4 w-3/4" /></div></div>)}</div>;
}
