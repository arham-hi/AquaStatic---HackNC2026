"use client";
// Connect: one stream of everything happening, plus your matches. Chat opens in a sheet, not a page.

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { HeartHandshake, Plus, Check, X, MessageSquare, CheckCircle2, Search as SearchIcon, Gift, HandHelping, MapPin } from "lucide-react";
import { useLive } from "@/hooks/useLive";
import { api } from "@/lib/client";
import { useSession, useUI } from "@/components/shell/providers";
import { Page } from "@/components/shell/app-shell";
import { Button } from "@/components/ui/button";
import { Badge, Chip, Dialog, DialogContent, EmptyState, Input, Avatar } from "@/components/ui/primitives";
import { FeedCard, FeedSkeleton, type FeedItemWithSaved } from "@/components/feed/feed-card";
import { PostDetail } from "@/components/posts/post-detail";
import { ConversationThread } from "@/components/messages/conversation-thread";
import { getLocation } from "@/lib/locations";
import { AquaImpact } from "@/components/feed/aqua-impact";
import { timeAgo } from "@/lib/time";
import { cn } from "@/lib/utils";
import type { MatchView } from "@/lib/services/connections";
import type { FeedItem } from "@/lib/services/feed";
import type { Post } from "@/lib/db/schema";

type FeedResp = { items: FeedItemWithSaved[]; total: number };
type Scope = "all" | "events" | "help";

export function ConnectPage() {
  const params = useSearchParams();
  const router = useRouter();
  const { user, ensureUser } = useSession();
  const { openCreate } = useUI();
  const [scope, setScope] = useState<Scope>((params.get("scope") as Scope) || "all");
  const [q, setQ] = useState(params.get("q") ?? "");
  const [limit, setLimit] = useState(40);
  const [selected, setSelected] = useState<FeedItem | null>(null);
  const [matchOpen, setMatchOpen] = useState<string | null>(params.get("match"));
  const [chatId, setChatId] = useState<string | null>(null);

  const feedUrl = useMemo(() => `/api/feed?filter=${scope === "events" ? "events" : "all"}&window=recent&limit=${limit}${q ? `&q=${encodeURIComponent(q)}` : ""}`, [scope, q, limit]);
  const feed = useLive<FeedResp>(feedUrl, { interval: 5000, scopes: ["posts", "matches", "sources"] });
  const matches = useLive<{ matches: MatchView[] }>(user ? "/api/matches" : null, { interval: 3000, scopes: ["matches", "posts", "messages"] });

  const items = useMemo(() => (feed.data?.items ?? []).filter((i) => scope !== "help" || i.type === "request" || i.type === "offer"), [feed.data, scope]);
  const mine = (matches.data?.matches ?? []).filter((m) => m.status !== "declined" && m.status !== "cancelled");

  useEffect(() => {
    const pid = params.get("post");
    if (pid) api.get<{ item: FeedItem }>(`/api/posts/${pid}`).then((r) => setSelected(r.item)).catch(() => {});
    const mid = params.get("match");
    if (mid) setMatchOpen(mid);
  }, [params]);

  const respond = async (id: string, action: "accept" | "decline" | "complete" | "leave") => {
    try {
      await ensureUser();
      const r = await api.post<{ match: MatchView }>(`/api/matches/${id}`, { action });
      await matches.refresh();
      if (action === "accept") {
        if (r.match.status === "accepted" && r.match.conversationId) { toast.success("You're connected!"); setMatchOpen(null); setChatId(r.match.conversationId); }
        else toast.success("Accepted. Chat opens as soon as they accept too.");
      } else if (action === "complete") toast.success("Marked complete.");
      else toast(action === "decline" ? "Match declined" : "You left the match.");
    } catch (e) { toast.error((e as Error).message); }
  };
  const openMatch = mine.find((m) => m.id === matchOpen) ?? null;

  return (
    <Page title="Connect" subtitle="What's happening, who needs a hand, and who can help."
      actions={<><Button variant="secondary" onClick={() => openCreate("I have ")}><Gift /> Offer help</Button><Button onClick={() => openCreate("I need ")}><HandHelping /> Request help</Button></>}>
      <div className="mx-auto max-w-2xl space-y-6">
        <AquaImpact />
        {mine.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-fg-muted">Your matches</h2>
            {mine.map((m) => <MatchCard key={m.id} m={m} onRespond={respond} onOpen={() => setMatchOpen(m.id)} onChat={() => m.conversationId && setChatId(m.conversationId)} highlight={m.id === params.get("match")} />)}
          </section>
        )}

        <div className="flex gap-2 items-center">
          <div className="relative flex-1"><SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-fg-faint" /><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" className="pl-9" aria-label="Search" /></div>
          {(["all", "events", "help"] as const).map((s) => <Chip key={s} active={scope === s} onClick={() => setScope(s)}>{s === "all" ? "All" : s === "events" ? "Events" : "Help"}</Chip>)}
        </div>

        {feed.loading && !feed.data ? <FeedSkeleton /> : items.length === 0 ? (
          <EmptyState icon={HeartHandshake} title="Nothing here yet" body="Be the first to post what's happening, or what you need." action={<Button onClick={() => openCreate()}><Plus /> Post</Button>} />
        ) : (
          <div className="space-y-3">
            {items.map((p) => <FeedCard key={p.id} item={p} onSelect={setSelected} />)}
            {feed.data && feed.data.total > items.length && <div className="text-center pt-2"><Button variant="secondary" onClick={() => setLimit((l) => l + 40)}>Show more</Button></div>}
          </div>
        )}
      </div>

      <Dialog open={!!selected} onOpenChange={(o) => { if (!o) { setSelected(null); if (params.get("post")) router.replace("/connect"); } }}>
        <DialogContent title={selected?.title ?? "Post"} hideClose className="max-w-xl">{selected && <PostDetail item={selected} onClose={() => setSelected(null)} />}</DialogContent>
      </Dialog>
      <Dialog open={!!openMatch} onOpenChange={(o) => { if (!o) { setMatchOpen(null); if (params.get("match")) router.replace("/connect"); } }}>
        <DialogContent title="Why this match" className="max-w-lg">{openMatch && <MatchExplain m={openMatch} onRespond={respond} onChat={() => { setMatchOpen(null); if (openMatch.conversationId) setChatId(openMatch.conversationId); }} />}</DialogContent>
      </Dialog>
      <Dialog open={!!chatId} onOpenChange={(o) => !o && setChatId(null)}>
        <DialogContent title="Chat" hideClose className="max-w-lg p-0 sm:p-0 overflow-hidden">
          {chatId && <div className="h-[70dvh] flex flex-col"><ConversationThread id={chatId} embedded /></div>}
        </DialogContent>
      </Dialog>
    </Page>
  );
}

export function MatchCard({ m, onRespond, onOpen, onChat, highlight }: { m: MatchView; onRespond: (id: string, a: "accept" | "decline" | "complete" | "leave") => Promise<void>; onOpen: () => void; onChat: () => void; highlight?: boolean }) {
  const other = m.myRole === "requester" ? m.offerer : m.requester;
  const mineAccepted = m.myRole === "requester" ? m.requesterAccepted : m.offererAccepted;
  const theirsAccepted = m.myRole === "requester" ? m.offererAccepted : m.requesterAccepted;
  const [busy, setBusy] = useState<string | null>(null);
  const act = async (a: "accept" | "decline" | "complete" | "leave") => { setBusy(a); try { await onRespond(m.id, a); } finally { setBusy(null); } };
  const reqLoc = getLocation(m.request.locationId), offLoc = getLocation(m.offer.locationId);
  return (
    <motion.article layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ type: "spring", stiffness: 300, damping: 26 }}
      className={cn("card p-4", highlight && "ring-2 ring-mint/60", m.status === "suggested" && "border-mint/40")}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-semibold"><HeartHandshake className="size-4 text-mint" />{m.status === "suggested" ? "Potential match" : m.status === "accepted" ? "Connected" : "Completed"}</div>
        <button type="button" onClick={onOpen} className="text-xs text-carolina hover:underline">Why? <b>{Math.round(m.score * 100)}%</b></button>
      </div>
      <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        <Side label="Request" who={m.requester} post={m.request} loc={reqLoc?.name} tone="carolina" />
        <div className="h-0.5 w-8 rounded bg-gradient-to-r from-carolina to-mint" aria-hidden />
        <Side label="Offer" who={m.offerer} post={m.offer} loc={offLoc?.name} tone="mint" />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {m.status === "suggested" && m.myRole && (mineAccepted ? <Badge tone="mint"><Check className="size-3" /> You accepted · waiting for {other?.displayName?.replace(/ \(demo\)$/, "") ?? "them"}</Badge> : (
          <><Button size="sm" variant="mint" loading={busy === "accept"} onClick={() => act("accept")}><Check /> Accept</Button><Button size="sm" variant="ghost" loading={busy === "decline"} onClick={() => act("decline")}><X /> Decline</Button>{theirsAccepted && <Badge tone="mint">{other?.displayName?.replace(/ \(demo\)$/, "") ?? "They"} already accepted</Badge>}</>
        ))}
        {m.status === "accepted" && m.conversationId && <Button size="sm" onClick={onChat}><MessageSquare /> Open chat</Button>}
        {m.status === "accepted" && m.myRole && <Button size="sm" variant="secondary" loading={busy === "complete"} onClick={() => act("complete")}><CheckCircle2 /> Mark complete</Button>}
        {m.status === "completed" && <Badge tone="mint"><CheckCircle2 className="size-3" /> Done · {timeAgo(m.updatedAt)}</Badge>}
      </div>
    </motion.article>
  );
}

function Side({ label, who, post, loc, tone }: { label: string; who: MatchView["requester"]; post: Post; loc?: string; tone: "carolina" | "mint" }) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1.5 mb-1"><Avatar emoji={who?.avatar} name={who?.displayName} size={22} /><span className="text-xs font-medium truncate">{who?.displayName?.replace(/ \(demo\)$/, "") ?? "Student"}</span></div>
      <Badge tone={tone} className="mb-1">{label}</Badge>
      <div className="text-sm font-medium leading-snug line-clamp-2">{post.title}</div>
      {loc && <div className="text-[11px] text-fg-muted inline-flex items-center gap-1 mt-0.5"><MapPin className="size-3" />{loc}</div>}
    </div>
  );
}

function MatchExplain({ m, onRespond, onChat }: { m: MatchView; onRespond: (id: string, a: "accept" | "decline" | "complete" | "leave") => Promise<void>; onChat: () => void }) {
  const mineAccepted = m.myRole === "requester" ? m.requesterAccepted : m.offererAccepted;
  return (
    <div className="space-y-4">
      <div className="text-sm"><div className="font-semibold">{m.request.title}</div><div className="text-fg-muted">↔ {m.offer.title}</div></div>
      <ul className="space-y-2">
        {m.explanation.parts.map((p) => (
          <li key={p.label}>
            <div className="flex items-center justify-between text-xs"><span className="font-medium">{p.label}</span><span className="tabular-nums">{Math.round(p.score * 100)}</span></div>
            <div className="h-1.5 rounded-full bg-fg/10 mt-1 overflow-hidden"><div className="h-full rounded-full" style={{ width: `${p.score * 100}%`, background: p.score > 0.7 ? "#2fbf8f" : p.score > 0.4 ? "#4b9cd3" : "#f0a21b" }} /></div>
            <div className="text-[11px] text-fg-muted mt-0.5">{p.detail}</div>
          </li>
        ))}
      </ul>
      {m.status === "suggested" && m.myRole && !mineAccepted && <div className="flex gap-2"><Button variant="mint" onClick={() => onRespond(m.id, "accept")}><Check /> Accept match</Button><Button variant="ghost" onClick={() => onRespond(m.id, "decline")}>Decline</Button></div>}
      {m.status === "accepted" && m.conversationId && <Button onClick={onChat}><MessageSquare /> Open chat</Button>}
    </div>
  );
}
