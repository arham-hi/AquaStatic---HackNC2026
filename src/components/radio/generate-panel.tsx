"use client";

import { useState } from "react";
import { Sparkles, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, Chip, Input, Label } from "@/components/ui/primitives";
import { BRIEFING_FORMATS, type BriefingFormat } from "@/lib/db/schema";
import { cn } from "@/lib/utils";
import { FORMATS, INTERESTS, INTEREST_LABELS } from "./formats";

export type GenerateInput = { format: BriefingFormat; length: "short" | "medium" | "long"; topic?: string };
const LENGTHS = ["short", "medium", "long"] as const;

export function GeneratePanel({ interests, onInterests, onGenerate, generating, error, id }: {
  interests: string[]; onInterests: (next: string[]) => void; onGenerate: (input: GenerateInput) => void; generating: boolean; error: string | null; id?: string;
}) {
  const [format, setFormat] = useState<BriefingFormat>("radio");
  const [length, setLength] = useState<(typeof LENGTHS)[number]>("medium");
  const [topic, setTopic] = useState("");
  const toggle = (i: string) => onInterests(interests.includes(i) ? interests.filter((x) => x !== i) : [...interests, i]);

  return (
    <Card id={id} className="p-5 rounded-[20px] space-y-5 scroll-mt-20">
      <div>
        <h2 className="font-semibold tracking-tight">Make a briefing</h2>
        <p className="text-xs text-fg-muted mt-0.5">Written only from what&apos;s actually posted right now.</p>
      </div>

      <div role="radiogroup" aria-label="Format" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-2">
        {BRIEFING_FORMATS.map((f) => {
          const m = FORMATS[f], active = f === format;
          return (
            <button key={f} type="button" role="radio" aria-checked={active} onClick={() => setFormat(f)}
              className={cn("flex items-center gap-3 rounded-2xl border px-3 py-2.5 text-left transition-all", active ? "border-carolina bg-carolina-soft/60 shadow-sm ring-2 ring-carolina/25" : "border-border bg-bg-elev/70 hover:border-border-strong")}>
              <span className={cn("grid size-9 shrink-0 place-items-center rounded-xl", active ? "bg-carolina text-white" : "bg-fg/6 text-fg-muted")}><m.icon className="size-4" /></span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold leading-tight">{m.label}</span>
                <span className="block text-[11px] text-fg-muted">{m.blurb}</span>
              </span>
            </button>
          );
        })}
      </div>

      {FORMATS[format].topic && (
        <div className="space-y-1.5 animate-rise">
          <Label htmlFor="radio-topic">Topic (optional)</Label>
          <Input id="radio-topic" value={topic} maxLength={80} placeholder="e.g. basketball, career fair, free food" onChange={(e) => setTopic(e.target.value)} />
        </div>
      )}

      <div className="space-y-1.5">
        <Label id="radio-length-label">Length</Label>
        <div role="group" aria-labelledby="radio-length-label" className="grid grid-cols-3 gap-1 rounded-xl bg-fg/5 p-1">
          {LENGTHS.map((l) => (
            <button key={l} type="button" aria-pressed={l === length} onClick={() => setLength(l)}
              className={cn("rounded-lg py-1.5 text-sm font-medium capitalize transition-all", l === length ? "bg-bg-elev text-fg shadow-sm" : "text-fg-muted hover:text-fg")}>{l}</button>
          ))}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label id="radio-interests-label">Your interests</Label>
        <div role="group" aria-labelledby="radio-interests-label" className="flex flex-wrap gap-1.5">
          {INTERESTS.map((i) => <Chip key={i} active={interests.includes(i)} onClick={() => toggle(i)}>{INTEREST_LABELS[i]}</Chip>)}
        </div>
        <p className="text-[11px] text-fg-faint">Saved to your profile. No picks = everything.</p>
      </div>

      {error && <p role="alert" className="flex items-start gap-2 rounded-xl bg-red-soft px-3 py-2 text-xs text-red"><AlertCircle className="size-3.5 mt-0.5 shrink-0" />{error}</p>}

      <Button size="lg" className="w-full" loading={generating} onClick={() => onGenerate({ format, length, topic: FORMATS[format].topic && topic.trim() ? topic.trim() : undefined })}>
        {!generating && <Sparkles />}
        {generating ? "Writing your briefing…" : `Generate ${FORMATS[format].label}`}
      </Button>
    </Card>
  );
}
