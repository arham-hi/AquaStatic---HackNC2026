"use client";

// Demo-video only: a discreet panel that fires two pre-scripted ElevenLabs lines so a
// recorded demo can show a bus/rideshare and an events recommendation on demand. Hidden
// unless NODE_ENV is development AND the page is opened with ?demoVoice=1. Collapses to a
// corner chip during recording — keys 1 / 2 / Esc keep working while it is hidden.

import { useEffect, useState } from "react";
import { ChevronUp, Clapperboard, Square, Volume2 } from "lucide-react";
import { Badge } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";
import type { DemoClip, DemoVoice } from "./use-demo-voice";

const CLIP_KEY: Record<string, DemoClip> = { "1": "bus", "2": "events" };

export function DemoVoicePanel({ demo, disabled }: { demo: DemoVoice; disabled: boolean }) {
  const [open, setOpen] = useState(true);

  // Keyboard triggers for recording takes: 1 = bus line, 2 = events line, Esc = stop.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (disabled) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      const clip = CLIP_KEY[e.key];
      if (clip) { e.preventDefault(); void demo.play(clip); }
      else if (e.key === "Escape" && demo.playing) demo.stop();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [demo, disabled]);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-4 right-4 z-40 inline-flex items-center gap-1.5 rounded-full border border-dashed border-amber/60 bg-bg-elev/90 px-3 py-1.5 text-[11px] font-semibold text-amber shadow-sm backdrop-blur"
        title="Demo voice controls (1: bus, 2: events, Esc: stop)"
      >
        <Clapperboard className="size-3.5" /> Demo
      </button>
    );
  }

  return (
    <section aria-label="Demo voice controls" className="mt-4 rounded-[20px] border border-dashed border-amber/60 bg-amber/5 px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="aero-eyebrow !mb-0"><Clapperboard className="size-3" /> Demo voice controls</span>
        <Badge tone="amber">Scripted demo audio</Badge>
        <div className="ml-auto flex items-center gap-1.5">
          <button
            type="button"
            onClick={demo.stop}
            disabled={!demo.playing}
            className="aero-button inline-flex h-8 items-center gap-1.5 rounded-full border border-border bg-bg-elev/80 px-3 text-xs font-semibold text-fg transition-colors hover:text-amber disabled:opacity-40"
          >
            <Square className="size-3" /> Stop playback
          </button>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Hide demo controls"
            title="Hide panel — 1/2 still trigger the lines, Esc stops"
            className="aero-button grid size-8 place-items-center rounded-full border border-border bg-bg-elev/80 text-fg-muted transition-colors hover:text-carolina"
          >
            <ChevronUp className="size-4" />
          </button>
        </div>
      </div>
      <p className="mt-1.5 text-[11px] leading-4 text-fg-muted">
        Pre-recorded lines for the demo video — hypothetical suggestions, not live AI advice or real-time data.
        Keys <kbd className="rounded border border-border px-1">1</kbd>/<kbd className="rounded border border-border px-1">2</kbd> trigger each line, <kbd className="rounded border border-border px-1">Esc</kbd> stops. Panel never appears in production.
      </p>
      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void demo.play("bus")}
          disabled={disabled}
          className={cn("btn-aero aero-button inline-flex h-10 items-center gap-2 rounded-full px-4 text-sm font-bold text-white disabled:opacity-40", demo.playing === "bus" && "ring-2 ring-amber")}
        >
          <Volume2 className="size-4" /> Play Bus Recommendation
        </button>
        <button
          type="button"
          onClick={() => void demo.play("events")}
          disabled={disabled}
          className={cn("btn-aero aero-button inline-flex h-10 items-center gap-2 rounded-full px-4 text-sm font-bold text-white disabled:opacity-40", demo.playing === "events" && "ring-2 ring-amber")}
        >
          <Volume2 className="size-4" /> Play Event Recommendation
        </button>
        {demo.playing && <Badge tone="carolina">Aqua is speaking…</Badge>}
        {demo.error && <span className="text-xs text-amber" role="alert">{demo.error}</span>}
      </div>
    </section>
  );
}
