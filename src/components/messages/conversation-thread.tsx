"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Ban, CheckCircle2, Flag, LogOut, MoreHorizontal, SendHorizonal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, Badge, Dropdown, DropdownContent, DropdownItem, DropdownSeparator, DropdownTrigger, EmptyState, Skeleton, Textarea } from "@/components/ui/primitives";
import { ReportDialog } from "@/components/posts/post-detail";
import { useLive } from "@/hooks/useLive";
import { api } from "@/lib/client";
import { fmtDay, fmtTime } from "@/lib/time";
import { cn } from "@/lib/utils";
import type { Message } from "@/lib/db/schema";
import type { ConversationView, MatchView } from "@/lib/services/connections";

type Msg = Omit<Message, "createdAt"> & { createdAt: string };
type Data = { conversation: ConversationView; messages: Msg[]; match: MatchView | null; me: string };

const STATUS_TONE: Record<string, "neutral" | "carolina" | "mint" | "amber" | "red"> = { suggested: "amber", accepted: "carolina", completed: "mint", declined: "red", cancelled: "neutral" };

export function ConversationThread({ id, embedded }: { id: string; embedded?: boolean }) {
  const live = useLive<Data>(`/api/conversations/${id}`, { interval: 2500, scopes: ["messages", "matches"] });
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [reporting, setReporting] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);
  const data = live.data;
  const count = data?.messages.length ?? 0;

  useEffect(() => { bottom.current?.scrollIntoView({ block: "end" }); }, [count]);

  if (live.error && !data) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        <EmptyState title="Conversation unavailable" body={live.error} action={<Button asChild variant="secondary"><Link href="/messages"><ArrowLeft /> Back to messages</Link></Button>} />
      </div>
    );
  }
  if (!data) {
    return <div className="mx-auto max-w-3xl px-4 py-6 space-y-3"><Skeleton className="h-12" /><Skeleton className="h-20" /><Skeleton className="h-64" /></div>;
  }

  const other = data.conversation.participants.find((p) => p.id !== data.me) ?? data.conversation.participants[0];
  const match = data.match;
  const completed = match?.status === "completed";
  const closed = completed || match?.status === "cancelled" || match?.status === "declined";

  const send = async () => {
    const content = draft.trim();
    if (!content || sending) return;
    setSending(true);
    const optimistic: Msg = { id: `tmp_${Date.now()}`, conversationId: id, senderId: data.me, content, createdAt: new Date().toISOString() };
    live.setData((p) => (p ? { ...p, messages: [...p.messages, optimistic] } : p));
    setDraft("");
    try {
      await api.post(`/api/conversations/${id}/messages`, { content });
      await live.refresh();
    } catch (e) {
      toast.error((e as Error).message);
      setDraft(content);
      live.setData((p) => (p ? { ...p, messages: p.messages.filter((m) => m.id !== optimistic.id) } : p));
    } finally { setSending(false); }
  };

  const matchAction = async (action: "complete" | "leave") => {
    if (!match) return;
    if (action === "leave" && !confirm("Leave this match? The conversation will close for both of you.")) return;
    try {
      await api.post(`/api/matches/${match.id}`, { action });
      toast.success(action === "complete" ? "Marked as completed" : "You left the match");
      await live.refresh();
    } catch (e) { toast.error((e as Error).message); }
  };

  const block = async () => {
    if (!other || !confirm(`Block ${other.displayName}? You will not be matched or messaged by them again.`)) return;
    try { await api.post("/api/blocks", { userId: other.id }); toast.success("User blocked"); } catch (e) { toast.error((e as Error).message); }
  };

  let lastDay = "";

  return (
    <div className={embedded ? "flex flex-col h-full min-h-0 px-4 py-3" : "mx-auto max-w-3xl px-4 sm:px-6 py-4 flex flex-col h-[calc(100dvh-64px-96px)] md:h-[calc(100dvh-64px-40px)]"}>
      <header className="flex items-center gap-3 pb-3">
        <Button asChild variant="ghost" size="icon-sm" aria-label="Back to messages"><Link href="/messages"><ArrowLeft /></Link></Button>
        <Avatar emoji={other?.avatar} name={other?.displayName} size={40} />
        <div className="min-w-0 flex-1">
          <h1 className="font-semibold truncate">{other?.displayName ?? "Conversation"}</h1>
          {match && <Badge tone={STATUS_TONE[match.status] ?? "neutral"} className="capitalize">{match.status}</Badge>}
        </div>
        <Dropdown>
          <DropdownTrigger asChild><Button variant="ghost" size="icon-sm" aria-label="Conversation actions"><MoreHorizontal /></Button></DropdownTrigger>
          <DropdownContent>
            {match && !closed && <DropdownItem onSelect={() => matchAction("complete")}><CheckCircle2 className="size-4 text-mint" /> Mark completed</DropdownItem>}
            {match && !closed && <DropdownItem onSelect={() => matchAction("leave")}><LogOut className="size-4" /> Leave match</DropdownItem>}
            {match && !closed && <DropdownSeparator />}
            <DropdownItem onSelect={block}><Ban className="size-4" /> Block user</DropdownItem>
            <DropdownItem onSelect={() => setReporting(true)} className="text-red"><Flag className="size-4" /> Report</DropdownItem>
          </DropdownContent>
        </Dropdown>
      </header>

      {match && (
        <div className="card p-3 text-sm flex flex-wrap items-center gap-x-4 gap-y-1 mb-3">
          <div className="min-w-0"><span className="text-fg-faint text-xs uppercase tracking-wide font-semibold mr-1.5">Request</span><span className="font-medium">{match.request.title}</span></div>
          <div className="min-w-0"><span className="text-fg-faint text-xs uppercase tracking-wide font-semibold mr-1.5">Offer</span><span className="font-medium">{match.offer.title}</span></div>
          <Link href={`/connect?match=${match.id}`} className="ml-auto text-carolina text-xs font-medium hover:underline">View match</Link>
        </div>
      )}
      {completed && <div className="rounded-xl bg-mint-soft text-mint px-3 py-2 text-sm font-medium mb-3 flex items-center gap-2"><CheckCircle2 className="size-4" /> Connection completed</div>}

      <div className="flex-1 overflow-y-auto scrollbar-thin space-y-1.5 pr-1" role="log" aria-live="polite">
        {data.messages.length === 0 && <p className="text-center text-sm text-fg-muted py-10">No messages yet. Say hello and agree on a meeting spot.</p>}
        {data.messages.map((m) => {
          const at = new Date(m.createdAt);
          const day = fmtDay(at);
          const sep = day !== lastDay;
          lastDay = day;
          const mine = m.senderId === data.me;
          return (
            <div key={m.id}>
              {sep && <div className="text-center text-[11px] text-fg-faint my-3"><span className="rounded-full bg-fg/5 px-2.5 py-0.5">{day}</span></div>}
              <div className={cn("flex", mine ? "justify-end" : "justify-start")}>
                <div className={cn("max-w-[80%] rounded-2xl px-3.5 py-2 text-sm whitespace-pre-wrap break-words", mine ? "bg-carolina text-white rounded-br-md" : "bg-bg-elev border border-border rounded-bl-md", m.id.startsWith("tmp_") && "opacity-60")}>
                  {m.content}
                  <div className={cn("text-[10px] mt-0.5 text-right", mine ? "text-white/70" : "text-fg-faint")}>{fmtTime(at)}</div>
                </div>
              </div>
            </div>
          );
        })}
        <div ref={bottom} />
      </div>

      <form className="pt-3 flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); void send(); }}>
        <Textarea value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={2000} rows={1} disabled={sending || closed} aria-label="Message"
          placeholder={closed ? "This conversation is closed." : "Write a message… (Enter to send, Shift+Enter for a new line)"} className="min-h-[44px] max-h-40"
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }} />
        <Button type="submit" size="icon" loading={sending} disabled={!draft.trim() || closed} aria-label="Send"><SendHorizonal /></Button>
      </form>
      {reporting && other && <ReportDialog itemType="user" itemId={other.id} onClose={() => setReporting(false)} />}
    </div>
  );
}
