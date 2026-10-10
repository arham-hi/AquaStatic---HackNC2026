"use client";
// Detail card for a feed item (post or external). Used by the map, Discover and Connect deep links.

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { X, MapPin, Clock, ExternalLink, Bookmark, BookmarkCheck, Share2, Flag, Pencil, Trash2, CheckCircle2, Sparkles, HeartHandshake, Hourglass, Bus } from "lucide-react";
import { useLive } from "@/hooks/useLive";
import { api } from "@/lib/client";
import { useSession, useUI } from "@/components/shell/providers";
import { Button } from "@/components/ui/button";
import { Badge, Skeleton, Dialog, DialogContent, Textarea, Input, Chip } from "@/components/ui/primitives";
import { categoryMeta } from "@/lib/categories";
import { fmtDateTime, timeAgo, timeUntil } from "@/lib/time";
import { TrustBadge, TypeBadge, GreenBadge, shareItem, useSaveToggle } from "@/components/feed/feed-card";
import { LocationPicker } from "./location-picker";
import type { FeedItem } from "@/lib/services/feed";
import type { Post } from "@/lib/db/schema";
import { cn } from "@/lib/utils";

type PostResponse = { post: Post; author: { id: string; displayName: string; avatar: string; isDemo: boolean } | null; item: FeedItem; isMine: boolean; matchCount: number };

export function PostDetail({ item, onClose, className }: { item: FeedItem; onClose?: () => void; className?: string }) {
  const isPost = item.kind === "post";
  const { data, refresh, loading } = useLive<PostResponse>(isPost ? `/api/posts/${item.refId}` : null, { interval: 5000, scopes: ["posts", "matches"] });
  const { user } = useSession();
  const { focusMap, openCreate } = useUI();
  const router = useRouter();
  const toggleSave = useSaveToggle();
  const [saved, setSaved] = useState<boolean>((item as FeedItem & { saved?: boolean }).saved ?? false);
  const [editing, setEditing] = useState(false);
  const [reporting, setReporting] = useState(false);
  const nearest = useLive<{ stop: { name: string; code: string; meters: number; routes: string[] } | null; demo: boolean }>(item.lat != null && item.lng != null ? `/api/transit/nearest?lat=${item.lat}&lng=${item.lng}` : null, { interval: 600_000 });

  const live = data?.item ?? item;
  const post = data?.post;
  const meta = categoryMeta(live.category);
  const Icon = meta.icon;
  const isMine = !!data?.isMine;

  const act = async (fn: () => Promise<unknown>, ok: string) => {
    try { await fn(); toast.success(ok); await refresh(); } catch (e) { toast.error((e as Error).message); }
  };

  return (
    <div className={cn("flex flex-col", className)}>
      <div className="flex items-start gap-3">
        <div className="grid size-11 place-items-center rounded-xl text-white shrink-0" style={{ background: meta.color }}><Icon className="size-5" /></div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap mb-1"><TypeBadge type={live.type} /><TrustBadge item={live} /><GreenBadge category={live.category} />{post && post.status !== "open" && <Badge tone={post.status === "matched" || post.status === "fulfilled" || post.status === "resolved" ? "mint" : "neutral"}>{post.status.replace("_", " ")}</Badge>}</div>
          <h2 className="text-lg font-semibold leading-tight text-balance">{live.title}</h2>
        </div>
        {onClose && <button type="button" onClick={onClose} aria-label="Close" className="grid size-8 place-items-center rounded-lg text-fg-muted hover:bg-fg/5 shrink-0"><X className="size-4" /></button>}
      </div>

      {live.imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={live.imageUrl} alt="" className="mt-3 w-full max-h-44 object-cover rounded-xl bg-fg/5" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
      )}
      <p className="mt-3 text-sm leading-relaxed whitespace-pre-wrap">{isPost ? (post?.description ?? live.summary) : live.summary}</p>

      <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-sm">
        <dt className="text-fg-faint flex items-center gap-1"><Clock className="size-3.5" />When</dt>
        <dd>{live.startsAt && live.startsAt > Date.now() ? fmtDateTime(live.startsAt) : `${timeAgo(live.at)} · ${fmtDateTime(live.at)}`}{live.endsAt ? ` → ${fmtDateTime(live.endsAt)}` : ""}</dd>
        {(live.locationName || post?.locationNote) && (<><dt className="text-fg-faint flex items-center gap-1"><MapPin className="size-3.5" />Where</dt><dd>{live.locationName}{post?.locationNote ? ` · ${post.locationNote}` : ""}</dd></>)}
        {live.expiresAt && isPost && (<><dt className="text-fg-faint flex items-center gap-1"><Hourglass className="size-3.5" />Expires</dt><dd>{timeUntil(live.expiresAt)} · {fmtDateTime(live.expiresAt)}</dd></>)}
        {nearest.data?.stop && !nearest.data.demo && (<><dt className="text-fg-faint flex items-center gap-1"><Bus className="size-3.5" />Bus</dt><dd className="truncate">{nearest.data.stop.name} · {nearest.data.stop.meters} m{nearest.data.stop.routes.length ? ` · ${nearest.data.stop.routes.join(", ")}` : ""} · <Link href="/transit" className="text-carolina hover:underline">routes</Link></dd></>)}
        <dt className="text-fg-faint">Source</dt>
        <dd className="truncate">{isPost ? (data?.author ? `${data.author.avatar} ${data.author.displayName}` : loading ? <Skeleton className="w-24 inline-block" /> : "Community") : live.sourceLabel}</dd>
      </dl>

      {post && (
        <div className="mt-3 rounded-xl border border-border bg-fg/[0.03] p-3">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-fg-muted mb-2"><Sparkles className="size-3.5 text-carolina" /> How Aqua Static read this</div>
          <div className="flex flex-wrap gap-1.5">
            <Badge>{meta.label}</Badge>
            <Badge tone={post.urgency === "urgent" ? "red" : post.urgency === "soon" ? "amber" : "neutral"}>urgency: {post.urgency}</Badge>
            {post.attributes.item && <Badge tone="carolina">item: {post.attributes.item}</Badge>}
            {post.attributes.subject && <Badge tone="violet">subject: {post.attributes.subject}</Badge>}
          </div>
          {data && data.matchCount > 0 && <div className="mt-2 text-xs text-mint flex items-center gap-1"><HeartHandshake className="size-3.5" /> {data.matchCount} match suggestion{data.matchCount > 1 ? "s" : ""}</div>}
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        {live.lat != null && <Button size="sm" variant="secondary" onClick={() => { focusMap({ lat: live.lat!, lng: live.lng!, label: live.locationName ?? live.title, itemId: live.id }); router.push("/"); }}><MapPin /> Map</Button>}
        <Button size="sm" variant="secondary" onClick={() => void toggleSave(live, setSaved)}>{saved ? <BookmarkCheck className="text-carolina" /> : <Bookmark />}{saved ? "Saved" : "Save"}</Button>
        <Button size="sm" variant="secondary" onClick={() => void shareItem(live)}><Share2 /> Share</Button>
        {live.url && <Button size="sm" variant="secondary" asChild><a href={live.url} target="_blank" rel="noreferrer"><ExternalLink /> Open source</a></Button>}
        {isPost && (live.type === "request" || live.type === "offer") && !isMine && post?.status === "open" && (
          <Button size="sm" variant="mint" onClick={() => openCreate(live.type === "request" ? `I can help with: ${live.title}${live.locationName ? ` at ${live.locationName}` : ""}` : `I need: ${live.title}${live.locationName ? ` at ${live.locationName}` : ""}`)}><HeartHandshake /> {live.type === "request" ? "I can help" : "I need this"}</Button>
        )}
        {isPost && <Link href={`/connect?post=${live.refId}`} className="text-xs text-carolina self-center hover:underline ml-auto">Open in Connect</Link>}
      </div>

      {isPost && isMine && post && (
        <div className="mt-3 pt-3 border-t border-border flex flex-wrap gap-2">
          {post.status === "open" && <Button size="sm" variant="ghost" onClick={() => setEditing(true)}><Pencil /> Edit</Button>}
          {(post.status === "open" || post.status === "matched" || post.status === "in_progress") && <Button size="sm" variant="ghost" onClick={() => act(() => api.patch(`/api/posts/${post.id}`, { status: post.type === "request" ? "fulfilled" : "resolved" }), "Marked as done")}><CheckCircle2 /> Mark done</Button>}
          <Button size="sm" variant="ghost" className="text-red" onClick={() => { if (confirm("Delete this post?")) void act(async () => { await api.del(`/api/posts/${post.id}`); onClose?.(); }, "Post deleted"); }}><Trash2 /> Delete</Button>
        </div>
      )}
      {isPost && !isMine && user && (
        <div className="mt-3 pt-3 border-t border-border"><button type="button" onClick={() => setReporting(true)} className="text-xs text-fg-faint hover:text-red inline-flex items-center gap-1"><Flag className="size-3" /> Report this post</button></div>
      )}

      {post && editing && <EditPostDialog post={post} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); void refresh(); }} />}
      {reporting && <ReportDialog itemType="post" itemId={live.refId} onClose={() => setReporting(false)} />}
    </div>
  );
}

function EditPostDialog({ post, onClose, onSaved }: { post: Post; onClose: () => void; onSaved: () => void }) {
  const [title, setTitle] = useState(post.title);
  const [desc, setDesc] = useState(post.description);
  const [loc, setLoc] = useState<string | null>(post.locationId);
  const [expiry, setExpiry] = useState<"30m" | "1h" | "3h" | "today" | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title="Edit post">
        <div className="space-y-3">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} aria-label="Title" />
          <Textarea value={desc} onChange={(e) => setDesc(e.target.value)} maxLength={500} aria-label="Details" />
          <LocationPicker value={loc} onChange={setLoc} />
          <div className="flex gap-1.5 flex-wrap items-center"><span className="text-xs text-fg-muted mr-1">Extend:</span>{(["30m", "1h", "3h", "today"] as const).map((v) => <Chip key={v} active={expiry === v} onClick={() => setExpiry(expiry === v ? null : v)}>{v}</Chip>)}</div>
          <div className="flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>Cancel</Button><Button loading={busy} onClick={async () => { setBusy(true); try { await api.patch(`/api/posts/${post.id}`, { title, description: desc, locationId: loc, ...(expiry ? { expiry } : {}) }); toast.success("Saved"); onSaved(); } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); } }}>Save</Button></div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function ReportDialog({ itemType, itemId, onClose }: { itemType: "post" | "user" | "message"; itemId: string; onClose: () => void }) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title="Report" description="Tell us what's wrong. Reports go to moderators; the author is not notified.">
        <div className="space-y-3">
          <div className="flex gap-1.5 flex-wrap">{["Spam", "Harassment", "Misleading", "Unsafe", "Other"].map((r) => <Chip key={r} active={reason === r} onClick={() => setReason(r)}>{r}</Chip>)}</div>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Details (optional)" maxLength={500} />
          <div className="flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="danger" loading={busy} disabled={reason.trim().length < 3} onClick={async () => { setBusy(true); try { await api.post("/api/reports", { itemType, itemId, reason }); toast.success("Thanks, we'll take a look."); onClose(); } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); } }}>Submit report</Button></div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
