"use client";
// The live-call surface. Sits under the mascot hero while a call is active — transcript,
// source cards, mic control, and a typed fallback that always works.

import { useState } from "react";
import Link from "next/link";
import { ExternalLink, Mic, MicOff, PhoneOff, Radio, Send, ShieldCheck, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";
import { fmtTime } from "@/lib/time";
import type { Call } from "./use-call";

export function CallPanel({ call }: { call: Call }) {
  const [draft, setDraft] = useState("");
  const canType = call.phase === "listening" || call.phase === "speaking" || call.phase === "greeting";

  const send = () => {
    const t = draft.trim();
    if (!t || !canType) return;
    setDraft("");
    void call.submit(t);
  };

  return (
    <section aria-label="Live call with Aqua" className="mt-4 card rounded-[24px] p-5" data-call-phase={call.phase}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="aero-eyebrow !mb-0"><Radio className="size-3" /> Live with Aqua</span>
        <Badge tone="carolina"><Sparkles className="size-3" />AI host</Badge>
        <Badge tone="mint"><ShieldCheck className="size-3" />Private call — not broadcast</Badge>
        {call.voiceUsed && <Badge tone={call.voiceUsed === "elevenlabs" ? "mint" : "neutral"}><Mic className="size-3" />{call.voiceUsed === "elevenlabs" ? "Studio voice" : "Browser voice"}</Badge>}
        <span className="ml-auto text-xs font-semibold text-fg-muted" role="status">{call.status}</span>
      </div>
      <p className="mt-1 text-[11px] text-fg-faint">
        Aqua is an AI host, not a person. Your mic audio stays on this device — nothing is broadcast, saved, or transcribed into the station log.
      </p>

      {/* transcript */}
      <div className="mt-3 flex max-h-52 flex-col gap-1.5 overflow-y-auto rounded-2xl bg-fg/[0.03] p-3" aria-live="polite">
        {call.lines.length === 0 && <p className="text-sm text-fg-muted">Connecting…</p>}
        {call.lines.map((l, i) => (
          <p key={i} className={cn("max-w-[85%] rounded-2xl px-3 py-1.5 text-sm leading-5",
            l.role === "aqua" ? "self-start bg-carolina-soft/60 text-fg" : "self-end bg-mint-soft/60 text-fg")}>
            <span className="mr-1 text-[10px] font-bold uppercase text-fg-faint">{l.role === "aqua" ? "Aqua" : "You"}</span>
            {l.text}
          </p>
        ))}
        {call.interim && (
          <p className="self-end max-w-[85%] rounded-2xl px-3 py-1.5 text-sm italic text-fg-muted">
            <span className="mr-1 text-[10px] font-bold uppercase not-italic text-fg-faint">You</span>{call.interim}…
          </p>
        )}
        {call.phase === "thinking" && <p className="text-xs italic text-fg-muted">Aqua is thinking…</p>}
      </div>

      {/* source cards */}
      {call.cards.length > 0 && (
        <div className="mt-3">
          <div className="aero-eyebrow !mb-1.5">From the board</div>
          <div className="grid gap-1.5 sm:grid-cols-2">
            {call.cards.slice(0, 4).map((c) => (
              <Link key={c.id} href={c.href} className="flex items-center gap-2.5 rounded-xl border border-border bg-bg-elev/60 px-3 py-2 transition-colors hover:border-carolina/40 hover:text-carolina">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-semibold">{c.title}</span>
                  <span className="flex items-center gap-1 text-[10px] text-fg-muted">
                    <Badge tone="neutral" className="capitalize">{c.kind}</Badge>
                    {c.isDemo && <Badge tone="amber">DEMO</Badge>}
                    {c.at ? <span>{fmtTime(c.at)}</span> : null}
                  </span>
                </span>
                <ExternalLink className="size-3.5 shrink-0 text-fg-faint" />
              </Link>
            ))}
          </div>
        </div>
      )}

      {call.notice && <p className="mt-2 text-xs text-amber" role="alert">{call.notice}</p>}

      {/* controls */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={call.toggleMic}
          aria-pressed={call.micOn}
          aria-label={call.micOn ? "Mute microphone" : "Unmute microphone"}
          className={cn("aero-button grid size-11 place-items-center rounded-full border border-border bg-bg-elev/80 transition-colors",
            call.micOn ? "text-carolina" : "text-fg-muted")}
        >
          {call.micOn ? <Mic className="size-5" /> : <MicOff className="size-5" />}
        </button>
        <button
          type="button"
          onClick={() => void call.endCall()}
          className="btn-aero aero-button inline-flex h-11 items-center gap-2 rounded-full bg-red px-5 text-sm font-bold text-white"
        >
          <PhoneOff className="size-4" /> End call
        </button>

        <form className="ml-auto flex min-w-56 flex-1 items-center gap-2" onSubmit={(e) => { e.preventDefault(); send(); }}>
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={call.micOn ? "…or type to Aqua" : "Type to Aqua…"}
            disabled={!canType}
            aria-label="Type a message to Aqua"
            className="h-11 min-w-0 flex-1 rounded-full border border-border bg-bg-elev/80 px-4 text-sm outline-none transition-colors focus:border-carolina disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={!canType || !draft.trim()}
            aria-label="Send message"
            className="aero-button grid size-11 shrink-0 place-items-center rounded-full bg-carolina text-white transition-colors disabled:opacity-40"
          >
            <Send className="size-4" />
          </button>
        </form>
      </div>
    </section>
  );
}
