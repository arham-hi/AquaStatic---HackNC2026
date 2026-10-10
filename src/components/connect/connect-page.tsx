"use client";
// Connect: the community marketplace + the matching experience.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { HeartHandshake, Plus, Check, X, MessageSquare, Sparkles, MapPin, Clock, Gift, HandHelping, CheckCircle2, Search as SearchIcon } from "lucide-react";
import { useLive } from "@/hooks/useLive";
import { api } from "@/lib/client";
import { useSession, useUI } from "@/components/shell/providers";
import { Page } from "@/components/shell/app-shell";
import { Button } from "@/components/ui/button";
import { Badge, Chip, Dialog, DialogContent, EmptyState, Skeleton, Tabs, TabsList, TabsTrigger, Avatar, Input } from "@/components/ui/primitives";
import { FeedCard, FeedSkeleton, type FeedItemWithSaved } from "@/components/feed/feed-card";
import { PostDetail } from "@/components/posts/post-detail";
import { categoryMeta, CATEGORIES } from "@/lib/categories";
import { getLocation } from "@/lib/locations";
import { timeAgo, timeUntil } from "@/lib/time";
import { cn } from "@/lib/utils";
import type { MatchView } from "@/lib/services/connections";
import type { FeedItem } from "@/lib/services/feed";
import type { Post, PostCategory } from "@/lib/db/schema";

type FeedResp = { items: FeedItemWithSaved[]; total: number };

export function ConnectPage() {
  const params = useSearchParams();
  const router = useRouter();
  const { user, ensureUser } = useSession();
  const { openCreate } = useUI();
  const [tab, setTab] = useState<string>("browse");
  const [kind, setKind] = useState<"all" | "requests" | "offers">("all");
  const [cat, setCat] = useState<PostCategory | null>(null);
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<FeedItem | null>(null);
  const [matchOpen, setMatchOpen] = useState<string | null>(params.get("match"));

  const feedUrl = useMemo(() => `/api/feed?filter=${kind === "requests" ? "requests" : kind === "offers" ? "offers" : "all"}&window=recent&limit=120${q ? `&q=${encodeURIComponent(q)}` : ""}`, [kind, q]);
  const feed = useLive<FeedResp>(feedUrl, { interval: 4000, scopes: ["posts", "matches"] });
  const matches = useLive<{ matches: MatchView[] }>(user ? "/api/matches" : null, { interval: 3000, scopes: ["matches", "posts", "messages"] });
  const mine = useLive<{ posts: Post[] }>(user ? "/api/posts?mine=1" : null, { interval: 5000, scopes: ["posts", "matches"] });

  const posts = useMemo(() => (feed.data?.items ?? []).filter((i) => i.kind === "post" && (i.type === "request" || i.type === "offer") && (!cat || i.category === cat)), [feed.data, cat]);
  const ms = matches.data?.matches ?? [];
  const suggested = ms.filter((m) => m.status === "suggested");
  const active = ms.filter((m) => m.status === "accepted");
  const completed = ms.filter((m) => m.status === "completed");
  const myPosts = (mine.data?.posts ?? []).filter((p) => p.type === "request" || p.type === "offer");

  useEffect(() => {
    const pid = params.get("post");
    if (pid && feed.data) { const it = feed.data.items.find((i) => i.refId === pid); if (it) setSelected(it); else api.get<{ item: FeedItem }>(`/api/posts/${pid}`).then((r) => setSelected(r.item)).catch(() => {}); }
    const mid = params.get("match");
    if (mid) { setMatchOpen(mid); setTab("matches"); }
  }, [params, feed.data]);

  const respond = async (id: string, action: "accept" | "decline" | "complete" | "leave") => {
    try {
      await ensureUser();
      const r = await api.post<{ match: MatchView }>(`/api/matches/${id}`, { action });
      await matches.refresh();
      if (action === "accept") {
        if (r.match.status === "accepted" && r.match.conversationId) { toast.success("You're connected! Opening your conversation…"); router.push(`/messages/${r.match.conversationId}`); }
        else toast.success("Accepted. We'll open a chat as soon as they accept too.");
      } else if (action === "decline") toast("Match declined");
      else if (action === "complete") toast.success("Marked complete. Posts updated.");
      else toast("You left the match. Posts are open again.");
    } catch (e) { toast.error((e as Error).message); }
  };

  const openMatch = ms.find((m) => m.id === matchOpen) ?? null;

  return (
    <Page title="Connect" subtitle="Ask for what you need. Offer what you have. Aqua Static finds the overlap and introduces you." wide
      actions={<><Button variant="secondary" onClick={() => openCreate("I have ")}><Gift /> Offer help</Button><Button onClick={() => openCreate("I need ")}><HandHelping /> Request help</Button></>}>
      {!user && (
        <div className="mb-4 card p-4 flex flex-wrap items-center gap-3 border-carolina/30 bg-carolina-soft/30">
          <Sparkles className="size-5 text-carolina" /><div className="flex-1 text-sm"><b>Browsing as a guest.</b> You can read everything; posting or accepting a match creates a lightweight profile automatically.</div>
          <Button size="sm" variant="secondary" onClick={() => ensureUser().then(() => toast.success("Profile created. Set your name in Profile."))}>Create profile</Button>
        </div>
      )}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="mb-4 flex-wrap h-auto">
          <TabsTrigger value="browse">Nearby opportunities</TabsTrigger>
          <TabsTrigger value="matches">Matches {suggested.length > 0 && <Badge tone="mint" className="ml-1">{suggested.length}</Badge>}</TabsTrigger>
          <TabsTrigger value="active">Active {active.length > 0 && <Badge tone="carolina" className="ml-1">{active.length}</Badge>}</TabsTrigger>
          <TabsTrigger value="mine">My posts</TabsTrigger>
          <TabsTrigger value="done">Completed</TabsTrigger>
        </TabsList>

        {tab === "browse" && (
          <div className="space-y-4">
            <div className="card p-3 flex flex-col gap-2.5">
              <div className="flex gap-2 flex-wrap items-center">
                <div className="relative flex-1 min-w-[200px]"><SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-fg-faint" /><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search requests and offers…" className="pl-9" aria-label="Search" /></div>
                {(["all", "requests", "offers"] as const).map((k) => <Chip key={k} active={kind === k} onClick={() => setKind(k)}>{k === "all" ? "All" : k === "requests" ? <><HandHelping className="size-3.5" /> Requests</> : <><Gift className="size-3.5" /> Offers</>}</Chip>)}
              </div>
              <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
                {(["borrowing", "tutoring", "study", "lost_found", "free_food", "ride", "other"] as PostCategory[]).map((c) => { const m = CATEGORIES[c]; return <Chip key={c} active={cat === c} onClick={() => setCat(cat === c ? null : c)} style={cat === c ? { background: m.color, borderColor: m.color } : undefined}><m.icon className="size-3.5" />{m.label}</Chip>; })}
              </div>
            </div>
            {feed.loading && !feed.data ? <FeedSkeleton /> : posts.length === 0 ? (
              <EmptyState icon={HeartHandshake} title="No one has requested help nearby yet" body="Be the first to start a connection. Requests and offers expire automatically so the board stays fresh." action={<Button onClick={() => openCreate()}><Plus /> Post a request or offer</Button>} />
            ) : (
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{posts.map((p) => <FeedCard key={p.id} item={p} onSelect={setSelected} />)}</div>
            )}
          </div>
        )}

        {tab === "matches" && (
          <Section loading={matches.loading && !matches.data && !!user} empty={suggested.length === 0} emptyTitle="No suggested matches right now" emptyBody={user ? "When someone posts the complement of your request or offer, it shows up here with an explanation." : "Sign in by posting something, and matches will appear here."}>
            <AnimatePresence>{suggested.map((m) => <MatchCard key={m.id} m={m} onRespond={respond} onOpen={() => setMatchOpen(m.id)} highlight={m.id === params.get("match")} />)}</AnimatePresence>
          </Section>
        )}
        {tab === "active" && (
          <Section loading={false} empty={active.length === 0} emptyTitle="No active connections" emptyBody="Accept a suggested match to open a conversation.">
            {active.map((m) => <MatchCard key={m.id} m={m} onRespond={respond} onOpen={() => setMatchOpen(m.id)} />)}
          </Section>
        )}
        {tab === "done" && (
          <Section loading={false} empty={completed.length === 0} emptyTitle="Nothing completed yet" emptyBody="Completed connections live here as a little record of students helping students.">
            {completed.map((m) => <MatchCard key={m.id} m={m} onRespond={respond} onOpen={() => setMatchOpen(m.id)} />)}
          </Section>
        )}
        {tab === "mine" && (
          <div className="grid gap-4 md:grid-cols-2">
            {(["request", "offer"] as const).map((t) => (
              <div key={t} className="space-y-2">
                <h3 className="font-semibold text-sm flex items-center gap-1.5">{t === "request" ? <HandHelping className="size-4 text-carolina" /> : <Gift className="size-4 text-mint" />} My {t}s</h3>
                {myPosts.filter((p) => p.type === t).length === 0 ? <EmptyState title={`No ${t}s yet`} action={<Button size="sm" variant="secondary" onClick={() => openCreate(t === "request" ? "I need " : "I have ")}><Plus /> New {t}</Button>} /> :
                  myPosts.filter((p) => p.type === t).map((p) => <MyPostRow key={p.id} p={p} onOpen={() => api.get<{ item: FeedItem }>(`/api/posts/${p.id}`).then((r) => setSelected(r.item))} />)}
              </div>
            ))}
          </div>
        )}
      </Tabs>

      <Dialog open={!!selected} onOpenChange={(o) => { if (!o) { setSelected(null); if (params.get("post")) router.replace("/connect"); } }}>
        <DialogContent title={selected?.title ?? "Post"} hideClose className="max-w-xl">{selected && <PostDetail item={selected} onClose={() => setSelected(null)} />}</DialogContent>
      </Dialog>
      <Dialog open={!!openMatch} onOpenChange={(o) => { if (!o) { setMatchOpen(null); if (params.get("match")) router.replace("/connect"); } }}>
        <DialogContent title="Match details" description="Why Aqua Static suggested this connection." className="max-w-lg">
          {openMatch && <MatchExplain m={openMatch} onRespond={respond} />}
        </DialogContent>
      </Dialog>
    </Page>
  );
}

function Section({ loading, empty, emptyTitle, emptyBody, children }: { loading: boolean; empty: boolean; emptyTitle: string; emptyBody: string; children: React.ReactNode }) {
  if (loading) return <div className="grid gap-3 md:grid-cols-2">{[0, 1].map((i) => <Skeleton key={i} className="h-40 rounded-2xl" />)}</div>;
  if (empty) return <EmptyState icon={HeartHandshake} title={emptyTitle} body={emptyBody} />;
  return <div className="grid gap-3 md:grid-cols-2">{children}</div>;
}

function MyPostRow({ p, onOpen }: { p: Post; onOpen: () => void }) {
  const meta = categoryMeta(p.category);
  const loc = getLocation(p.locationId);
  return (
    <button type="button" onClick={onOpen} className="w-full text-left card p-3 flex items-center gap-3 hover:shadow-md transition-shadow">
      <span className="grid size-9 place-items-center rounded-lg text-white shrink-0" style={{ background: meta.color }}><meta.icon className="size-4" /></span>
      <span className="min-w-0 flex-1"><span className="block font-medium text-sm truncate">{p.title}</span><span className="block text-xs text-fg-muted">{loc?.name ?? "No location"} · {timeAgo(new Date(p.createdAt))}{p.expiresAt ? ` · ${timeUntil(new Date(p.expiresAt))}` : ""}</span></span>
      <Badge tone={p.status === "open" ? "carolina" : p.status === "expired" ? "neutral" : "mint"}>{p.status.replace("_", " ")}</Badge>
    </button>
  );
}

export function MatchCard({ m, onRespond, onOpen, highlight }: { m: MatchView; onRespond: (id: string, a: "accept" | "decline" | "complete" | "leave") => Promise<void>; onOpen: () => void; highlight?: boolean }) {
  const other = m.myRole === "requester" ? m.offerer : m.requester;
  const mineAccepted = m.myRole === "requester" ? m.requesterAccepted : m.offererAccepted;
  const theirsAccepted = m.myRole === "requester" ? m.offererAccepted : m.requesterAccepted;
  const [busy, setBusy] = useState<string | null>(null);
  const act = async (a: "accept" | "decline" | "complete" | "leave") => { setBusy(a); try { await onRespond(m.id, a); } finally { setBusy(null); } };
  const pct = Math.round(m.score * 100);
  const reqLoc = getLocation(m.request.locationId), offLoc = getLocation(m.offer.locationId);
  return (
    <motion.article layout initial={{ opacity: 0, y: 8, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, scale: 0.97 }} transition={{ type: "spring", stiffness: 300, damping: 26 }}
      className={cn("card p-4 relative overflow-hidden", highlight && "ring-2 ring-mint/60", m.status === "suggested" && "border-mint/40")}>
      <div className="absolute -right-10 -top-10 size-32 rounded-full bg-mint/10 blur-2xl" aria-hidden />
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-semibold"><HeartHandshake className="size-4 text-mint" />{m.status === "suggested" ? "Potential match" : m.status === "accepted" ? "Connected" : m.status === "completed" ? "Completed" : m.status}</div>
        <button type="button" onClick={onOpen} className="text-xs text-carolina hover:underline">Why this match? <b>{pct}%</b></button>
      </div>
      <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        <Side label="Request" who={m.requester} post={m.request} loc={reqLoc?.name} tone="carolina" />
        <motion.div initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ delay: 0.15, duration: 0.5 }} className="h-0.5 w-8 rounded bg-gradient-to-r from-carolina to-mint origin-left" aria-hidden />
        <Side label="Offer" who={m.offerer} post={m.offer} loc={offLoc?.name} tone="mint" />
      </div>
      <p className="mt-3 text-xs text-fg-muted">{m.explanation.reason}</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {m.status === "suggested" && m.myRole && (mineAccepted ? <Badge tone="mint"><Check className="size-3" /> You accepted · waiting for {other?.displayName ?? "them"}</Badge> : (
          <><Button size="sm" variant="mint" loading={busy === "accept"} onClick={() => act("accept")}><Check /> Accept</Button><Button size="sm" variant="ghost" loading={busy === "decline"} onClick={() => act("decline")}><X /> Decline</Button>{theirsAccepted && <Badge tone="mint">{other?.displayName ?? "They"} already accepted</Badge>}</>
        ))}
        {m.status === "suggested" && !m.myRole && <Badge>Between {m.requester?.displayName ?? "a student"} and {m.offerer?.displayName ?? "a student"}</Badge>}
        {m.status === "accepted" && m.conversationId && <Button size="sm" asChild><Link href={`/messages/${m.conversationId}`}><MessageSquare /> Open chat</Link></Button>}
        {m.status === "accepted" && m.myRole && <Button size="sm" variant="secondary" loading={busy === "complete"} onClick={() => act("complete")}><CheckCircle2 /> Mark complete</Button>}
        {m.status === "completed" && <Badge tone="mint"><CheckCircle2 className="size-3" /> Done · {timeAgo(new Date(m.updatedAt))}</Badge>}
        <span className="ml-auto text-[11px] text-fg-faint inline-flex items-center gap-1"><Clock className="size-3" />{timeAgo(new Date(m.createdAt))}</span>
      </div>
    </motion.article>
  );
}

function Side({ label, who, post, loc, tone }: { label: string; who: MatchView["requester"]; post: Post; loc?: string; tone: "carolina" | "mint" }) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1.5 mb-1"><Avatar emoji={who?.avatar} name={who?.displayName} size={22} /><span className="text-xs font-medium truncate">{who?.displayName ?? "Student"}</span></div>
      <Badge tone={tone} className="mb-1">{label}</Badge>
      <div className="text-sm font-medium leading-snug line-clamp-2">{post.title}</div>
      {loc && <div className="text-[11px] text-fg-muted inline-flex items-center gap-1 mt-0.5"><MapPin className="size-3" />{loc}</div>}
    </div>
  );
}

function MatchExplain({ m, onRespond }: { m: MatchView; onRespond: (id: string, a: "accept" | "decline" | "complete" | "leave") => Promise<void> }) {
  const mineAccepted = m.myRole === "requester" ? m.requesterAccepted : m.offererAccepted;
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="relative size-16 shrink-0"><svg viewBox="0 0 36 36" className="size-16 -rotate-90"><circle cx="18" cy="18" r="15.5" fill="none" stroke="currentColor" className="text-fg/10" strokeWidth="3" /><circle cx="18" cy="18" r="15.5" fill="none" stroke="#2fbf8f" strokeWidth="3" strokeDasharray={`${m.score * 97.4} 97.4`} strokeLinecap="round" /></svg><span className="absolute inset-0 grid place-items-center text-sm font-bold">{Math.round(m.score * 100)}%</span></div>
        <div className="text-sm"><div className="font-semibold">{m.request.title}</div><div className="text-fg-muted">↔ {m.offer.title}</div><div className="text-xs text-fg-faint mt-1">Status: {m.status}</div></div>
      </div>
      <ul className="space-y-2">
        {m.explanation.parts.map((p) => (
          <li key={p.label}>
            <div className="flex items-center justify-between text-xs"><span className="font-medium">{p.label} <span className="text-fg-faint">· {Math.round(p.weight * 100)}% weight</span></span><span className="tabular-nums">{Math.round(p.score * 100)}</span></div>
            <div className="h-1.5 rounded-full bg-fg/10 mt-1 overflow-hidden"><motion.div initial={{ width: 0 }} animate={{ width: `${p.score * 100}%` }} transition={{ duration: 0.6 }} className="h-full rounded-full" style={{ background: p.score > 0.7 ? "#2fbf8f" : p.score > 0.4 ? "#4b9cd3" : "#f0a21b" }} /></div>
            <div className="text-[11px] text-fg-muted mt-0.5">{p.detail}</div>
          </li>
        ))}
      </ul>
      <p className="text-xs text-fg-faint">Deterministic scoring: item/category 40%, availability overlap 25%, location 20%, keywords 15%. Expired, incompatible, blocked or previously declined pairs are rejected before scoring.</p>
      {m.status === "suggested" && m.myRole && !mineAccepted && <div className="flex gap-2"><Button variant="mint" onClick={() => onRespond(m.id, "accept")}><Check /> Accept match</Button><Button variant="ghost" onClick={() => onRespond(m.id, "decline")}>Decline</Button></div>}
      {m.status === "accepted" && m.conversationId && <Button asChild><Link href={`/messages/${m.conversationId}`}><MessageSquare /> Open conversation</Link></Button>}
    </div>
  );
}
