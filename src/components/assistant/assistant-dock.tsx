"use client";
// Grounded campus assistant. Every answer comes with the records it used; drafts need explicit confirmation.

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Sparkles, X, Send, MapPin, ExternalLink, FilePlus2, Bot } from "lucide-react";
import { api } from "@/lib/client";
import { useUI } from "@/components/shell/providers";
import { Button } from "@/components/ui/button";
import { Badge, Chip } from "@/components/ui/primitives";
import type { AssistantReply } from "@/lib/services/assistant";
import { cn } from "@/lib/utils";

type Turn = { role: "user" | "assistant"; text: string; reply?: AssistantReply; pending?: boolean };

const SUGGESTIONS = ["What's happening on campus right now?", "Any free food around?", "Who needs help near Davis Library?", "Events tonight?", "Transit notices I should know about?", "Summarize the campus news"];

export function AssistantDock() {
  const { assistantState, setAssistantOpen, openCreate, focusMap } = useUI();
  const router = useRouter();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const asked = useRef<string | null>(null);

  const send = async (question: string) => {
    const text = question.trim();
    if (!text || busy) return;
    setQ("");
    setBusy(true);
    setTurns((t) => [...t, { role: "user", text }, { role: "assistant", text: "", pending: true }]);
    try {
      const reply = await api.post<AssistantReply>("/api/assistant", { question: text });
      setTurns((t) => [...t.slice(0, -1), { role: "assistant", text: reply.answer, reply }]);
    } catch (e) {
      setTurns((t) => [...t.slice(0, -1), { role: "assistant", text: `Sorry — ${(e as Error).message}` }]);
    } finally { setBusy(false); }
  };

  useEffect(() => {
    if (assistantState.open && assistantState.question && asked.current !== assistantState.question) {
      asked.current = assistantState.question;
      void send(assistantState.question);
    }
  }, [assistantState.open, assistantState.question]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" }); }, [turns]);

  if (!assistantState.open) return null;
  return (
    <div role="dialog" aria-label="Ask Aqua Static" className="fixed z-[80] inset-x-0 bottom-0 md:inset-auto md:right-6 md:bottom-24 md:w-[420px] max-h-[85dvh] md:max-h-[640px] flex flex-col rounded-t-3xl md:rounded-3xl glass-strong animate-rise overflow-hidden">
      <div className="flex items-center gap-2 px-4 h-13 py-3 border-b border-border">
        <span className="grid size-8 place-items-center rounded-xl bg-carolina text-white"><Sparkles className="size-4" /></span>
        <div className="flex-1 leading-tight"><div className="text-sm font-semibold">Ask Aqua Static</div><div className="text-[11px] text-fg-muted">Answers only from live campus data</div></div>
        <button type="button" onClick={() => setAssistantOpen(false)} aria-label="Close assistant" className="grid size-8 place-items-center rounded-lg text-fg-muted hover:bg-fg/5"><X className="size-4" /></button>
      </div>
      <div ref={scroller} className="flex-1 overflow-y-auto scrollbar-thin px-4 py-3 space-y-3 min-h-[200px]">
        {turns.length === 0 && (
          <div className="space-y-3">
            <div className="flex gap-2"><span className="grid size-7 place-items-center rounded-lg bg-carolina-soft text-carolina shrink-0"><Bot className="size-4" /></span><p className="text-sm text-fg-muted">Hi! Ask about events, free food, alerts, buses, or who can help you right now. I only cite things actually posted in Aqua Static.</p></div>
            <div className="flex flex-wrap gap-1.5">{SUGGESTIONS.map((s) => <Chip key={s} onClick={() => void send(s)}>{s}</Chip>)}</div>
          </div>
        )}
        {turns.map((t, i) => (
          <div key={i} className={cn("flex", t.role === "user" ? "justify-end" : "justify-start")}>
            <div className={cn("max-w-[92%] rounded-2xl px-3.5 py-2.5 text-sm whitespace-pre-wrap leading-relaxed", t.role === "user" ? "bg-carolina text-white rounded-br-md" : "bg-bg-elev border border-border rounded-bl-md")}>
              {t.pending ? <span className="inline-flex gap-1 py-1" aria-label="Thinking"><i className="size-1.5 rounded-full bg-fg-faint animate-bounce" /><i className="size-1.5 rounded-full bg-fg-faint animate-bounce [animation-delay:120ms]" /><i className="size-1.5 rounded-full bg-fg-faint animate-bounce [animation-delay:240ms]" /></span> : t.text}
              {t.reply && (
                <div className="mt-2.5 space-y-2">
                  {t.reply.sources.length > 0 && (
                    <ul className="space-y-1">
                      {t.reply.sources.slice(0, 5).map((s) => (
                        <li key={s.id} className="flex items-center gap-1.5 text-xs">
                          <span className="size-1.5 rounded-full bg-carolina shrink-0" />
                          {s.href.startsWith("http") ? <a href={s.href} target="_blank" rel="noreferrer" className="truncate hover:underline inline-flex items-center gap-1">{s.title}<ExternalLink className="size-3 text-fg-faint" /></a> : <Link href={s.href} onClick={() => setAssistantOpen(false)} className="truncate hover:underline">{s.title}</Link>}
                          {s.isDemo && <Badge tone="amber">DEMO</Badge>}
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="flex flex-wrap gap-1.5 items-center">
                    {t.reply.mapFocus && <Button size="sm" variant="secondary" onClick={() => { focusMap({ lat: t.reply!.mapFocus!.lat, lng: t.reply!.mapFocus!.lng, label: t.reply!.mapFocus!.label }); router.push("/"); }}><MapPin /> Show on map</Button>}
                    {t.reply.draft && <Button size="sm" onClick={() => { setAssistantOpen(false); openCreate(turns[i - 1]?.text); }}><FilePlus2 /> Review & post</Button>}
                    <span className="text-[10px] text-fg-faint ml-auto">{t.reply.provider === "gemini" ? "Gemini · grounded" : "Local mode · grounded"}</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
      <form onSubmit={(e) => { e.preventDefault(); void send(q); }} className="flex items-center gap-2 p-3 border-t border-border">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask anything about campus…" aria-label="Question" className="flex-1 h-10 rounded-xl bg-bg-elev border border-border px-3 text-sm outline-none focus:border-carolina" autoFocus />
        <Button type="submit" size="icon" loading={busy} aria-label="Send"><Send /></Button>
      </form>
    </div>
  );
}
