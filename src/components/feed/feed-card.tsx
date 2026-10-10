"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Bookmark, BookmarkCheck, ExternalLink, MapPin, Share2, Clock, ImageOff } from "lucide-react";
import { categoryMeta, TYPE_META, TRUST_META } from "@/lib/categories";
import { fmtDateTime, timeAgo, timeUntil } from "@/lib/time";
import { api } from "@/lib/client";
import { useSession, useUI } from "@/components/shell/providers";
import { Badge } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";
import type { FeedItem } from "@/lib/services/feed";

export type FeedItemWithSaved = FeedItem & { saved?: boolean };

export function TrustBadge({ item }: { item: Pick<FeedItem, "trust" | "sourceStatus"> }) {
  const t = TRUST_META[item.trust];
  return <Badge className={t.tone}>{item.trust === "community" && item.sourceStatus === "user_event" ? "Student event" : t.label}</Badge>;
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

export function FeedCard({ item, onSelect, selected, compact, onSavedChange }: { item: FeedItemWithSaved; onSelect?: (item: FeedItem) => void; selected?: boolean; compact?: boolean; onSavedChange?: (saved: boolean) => void }) {
  const meta = categoryMeta(item.category);
  const Icon = meta.icon;
  const { focusMap } = useUI();
  const router = useRouter();
  const toggleSave = useSaveToggle();
  const when = item.startsAt && item.startsAt > Date.now() ? fmtDateTime(item.startsAt) : timeAgo(item.at);

  const viewOnMap = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (item.lat == null || item.lng == null) return toast.message("No map location for this item");
    focusMap({ lat: item.lat, lng: item.lng, label: item.locationName ?? item.title, itemId: item.id });
    router.push("/");
  };

  return (
    <article onClick={() => onSelect?.(item)} className={cn("group card relative flex gap-3 transition-all cursor-pointer hover:-translate-y-px hover:shadow-md", selected && "ring-2 ring-carolina/50 border-carolina/40", compact ? "p-3" : "p-4", item.type === "alert" && item.urgency === "urgent" && "border-red/40")}
      role={onSelect ? "button" : undefined} tabIndex={onSelect ? 0 : undefined} onKeyDown={(e) => { if (onSelect && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); onSelect(item); } }}>
      <div className="shrink-0 grid size-10 place-items-center rounded-xl text-white shadow-sm" style={{ background: meta.color }}><Icon className="size-5" /></div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 flex-wrap mb-1">
          <TypeBadge type={item.type} />
          <TrustBadge item={item} />
          {item.status === "matched" && <Badge tone="mint">Matched</Badge>}
          {item.status === "fulfilled" && <Badge tone="mint">Fulfilled</Badge>}
          {item.urgency === "urgent" && item.type !== "alert" && <Badge tone="red">Urgent</Badge>}
        </div>
        <h3 className={cn("font-semibold leading-snug text-balance", compact ? "text-sm" : "text-[15px]")}>{item.title}</h3>
        {!compact && item.summary && item.summary !== item.title && <p className="text-sm text-fg-muted mt-1 line-clamp-2">{item.summary}</p>}
        <div className="mt-2 flex items-center gap-x-3 gap-y-1 flex-wrap text-xs text-fg-muted">
          <span className="inline-flex items-center gap-1"><Clock className="size-3" />{when}</span>
          {item.locationName && <span className="inline-flex items-center gap-1 truncate max-w-[200px]"><MapPin className="size-3" />{item.locationName}</span>}
          {item.expiresAt && item.kind === "post" && <span className="text-fg-faint">{timeUntil(item.expiresAt)}</span>}
          <span className="text-fg-faint truncate">{item.kind === "post" && item.authorName ? `by ${item.authorName}` : item.sourceLabel}</span>
        </div>
        {!compact && (
          <div className="mt-3 flex items-center gap-1 -ml-1.5 opacity-80 group-hover:opacity-100" onClick={(e) => e.stopPropagation()}>
            <ActionBtn label={item.saved ? "Saved" : "Save"} onClick={() => void toggleSave(item, onSavedChange)}>{item.saved ? <BookmarkCheck className="size-3.5 text-carolina" /> : <Bookmark className="size-3.5" />}</ActionBtn>
            <ActionBtn label="Share" onClick={() => void shareItem(item)}><Share2 className="size-3.5" /></ActionBtn>
            <ActionBtn label="View on map" onClick={viewOnMap} disabled={item.lat == null}><MapPin className="size-3.5" /></ActionBtn>
            {item.url && <a href={item.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-lg px-2 h-7 text-xs text-fg-muted hover:text-fg hover:bg-fg/5"><ExternalLink className="size-3.5" /> Source</a>}
            {item.kind === "post" && <Link href={item.href} className="ml-auto text-xs text-carolina hover:underline">Open</Link>}
          </div>
        )}
      </div>
      {!compact && item.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={item.imageUrl} alt="" className="hidden sm:block size-20 rounded-xl object-cover shrink-0 bg-fg/5" loading="lazy" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
      ) : null}
    </article>
  );
}

function ActionBtn({ label, onClick, children, disabled }: { label: string; onClick: (e: React.MouseEvent) => void; children: React.ReactNode; disabled?: boolean }) {
  return <button type="button" onClick={onClick} disabled={disabled} className="inline-flex items-center gap-1 rounded-lg px-2 h-7 text-xs text-fg-muted hover:text-fg hover:bg-fg/5 disabled:opacity-40">{children}{label}</button>;
}

export function FeedSkeleton({ n = 4 }: { n?: number }) {
  return <div className="space-y-3">{Array.from({ length: n }).map((_, i) => <div key={i} className="card p-4 flex gap-3"><div className="skeleton size-10 rounded-xl" /><div className="flex-1 space-y-2"><div className="skeleton h-3 w-24" /><div className="skeleton h-4 w-3/4" /><div className="skeleton h-3 w-1/2" /></div></div>)}</div>;
}

export const NoImage = ImageOff;
