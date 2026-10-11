"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Play, Pause, RotateCcw, SkipBack, SkipForward, Copy, Download, ExternalLink, FileText, Bot, Cpu, AudioLines, Volume2, VolumeX, Loader2, Bus, MessageSquare, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, Card, Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/primitives";
import { fmtDateTime } from "@/lib/time";
import { cn } from "@/lib/utils";
import { briefingAsText, fmtClock, FORMATS, WPM, type ClientBriefing } from "./formats";
import { RATES, useBriefingAudio } from "./use-briefing-audio";
import { Visualizer } from "./visualizer";

const SOURCE_ICON = { post: MessageSquare, external: Globe, transit: Bus } as const;

export function Player({ briefing, elevenlabs }: { briefing: ClientBriefing; elevenlabs: boolean | null }) {
  const meta = FORMATS[briefing.format];
  const audio = useBriefingAudio(briefing, elevenlabs !== false);
  const { state, mode, segment } = audio;
  const playing = state === "playing";
  const busy = state === "loading";
  const voiceLabel = mode === "mp3" ? "ElevenLabs voice" : mode === "tts" ? `Browser voice${audio.voiceName ? ` · ${audio.voiceName}` : ""}` : briefing.audioProvider === "elevenlabs" && elevenlabs !== false ? "ElevenLabs voice" : "Browser voice";
  const [tab, setTab] = useState(meta.text ? "transcript" : "segments");
  useEffect(() => setTab(meta.text ? "transcript" : "segments"), [briefing.id, meta.text]);

  // Auto-scroll the transcript to the active segment while playing.
  const transcriptRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const box = transcriptRef.current;
    const el = box?.querySelector<HTMLElement>(`[data-seg="${segment}"]`);
    if (!box || !el || state !== "playing") return;
    box.scrollTo({ top: el.offsetTop - 12, behavior: "smooth" });
  }, [segment, state]);

  const copy = async () => {
    try { await navigator.clipboard.writeText(briefingAsText(briefing)); toast.success("Transcript copied"); } catch { toast.error("Couldn't access the clipboard"); }
  };
  const download = () => {
    const url = URL.createObjectURL(new Blob([briefingAsText(briefing)], { type: "text/plain;charset=utf-8" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: `${briefing.title.replace(/[^\w]+/g, "-").replace(/^-|-$/g, "").toLowerCase() || "briefing"}.txt` });
    a.click();
    URL.revokeObjectURL(url);
  };
  const onBarKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowRight") { e.preventDefault(); audio.skip(1); }
    if (e.key === "ArrowLeft") { e.preventDefault(); audio.skip(-1); }
    if (e.key === "Home") { e.preventDefault(); audio.restart(); }
  };
  const progress = audio.duration ? Math.min(1, audio.elapsed / audio.duration) : 0;

  return (
    <Card className="p-0 overflow-hidden rounded-[22px] animate-rise">
      <div className="relative p-5 sm:p-6 bg-gradient-to-br from-carolina-soft/70 via-transparent to-transparent">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone="carolina"><meta.icon className="size-3" />{meta.label}</Badge>
          <Badge tone={briefing.provider === "gemini" ? "violet" : "neutral"}>{briefing.provider === "gemini" ? <Bot className="size-3" /> : <Cpu className="size-3" />}{briefing.provider === "gemini" ? "Gemini" : "Local script"}</Badge>
          <Badge tone={mode === "mp3" ? "mint" : "neutral"}><AudioLines className="size-3" />{voiceLabel}</Badge>
        </div>
        <h2 className="mt-3 text-xl sm:text-2xl font-semibold tracking-tight text-balance">{briefing.title}</h2>
        <p className="mt-1 text-xs text-fg-muted">
          {fmtDateTime(new Date(briefing.createdAt))} · {briefing.wordCount} words · about {Math.max(1, Math.round(briefing.wordCount / WPM))} min
          {briefing.interests.length ? ` · ${briefing.interests.length} interest${briefing.interests.length === 1 ? "" : "s"}` : ""}
        </p>

        {audio.notice && <p className="mt-3 inline-flex items-start gap-2 rounded-xl bg-amber-soft px-3 py-2 text-xs text-amber"><Volume2 className="size-3.5 mt-0.5 shrink-0" />{audio.notice}</p>}

        {mode === "none" ? (
          <div className="mt-4 flex items-start gap-3 rounded-2xl border border-border bg-bg-elev/70 p-4">
            <VolumeX className="size-5 text-fg-muted shrink-0" />
            <div className="text-sm"><div className="font-medium">No voice available in this browser</div><p className="text-fg-muted">Speech synthesis isn&apos;t supported here and studio audio is off. Read the transcript below, or copy and download it.</p></div>
          </div>
        ) : (
          <>
            {!meta.text && <Visualizer analyser={audio.analyser} active={playing} kickRef={audio.kickRef} className="mt-4 h-20" />}

            <div className="mt-4">
              <div role="slider" tabIndex={0} aria-label="Playback position" aria-valuemin={0} aria-valuemax={Math.round(audio.duration)} aria-valuenow={Math.round(audio.elapsed)} aria-valuetext={`${fmtClock(audio.elapsed)} of ${fmtClock(audio.duration)}`}
                onKeyDown={onBarKey}
                onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); audio.seekFraction((e.clientX - r.left) / r.width); }}
                className="group relative h-6 cursor-pointer flex items-center focus-visible:outline-none">
                <div className="h-1.5 w-full rounded-full bg-fg/10 overflow-hidden group-focus-visible:ring-4 group-focus-visible:ring-carolina/25">
                  <div className="h-full rounded-full bg-carolina transition-[width] duration-200 ease-linear" style={{ width: `${progress * 100}%` }} />
                </div>
                <div className="absolute top-1/2 -translate-y-1/2 -ml-1.5 size-3 rounded-full bg-carolina shadow ring-2 ring-bg-elev transition-[left] duration-200 ease-linear" style={{ left: `${progress * 100}%` }} />
              </div>
              <div className="flex justify-between text-[11px] tabular-nums text-fg-muted"><span>{fmtClock(audio.elapsed)}</span><span>{mode === "mp3" ? "" : "~"}{fmtClock(audio.duration)}</span></div>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" aria-label="Replay from start" onClick={audio.restart} disabled={busy}><RotateCcw /></Button>
                <Button variant="ghost" size="icon" aria-label="Previous segment" onClick={() => audio.skip(-1)} disabled={busy || segment === 0}><SkipBack /></Button>
                <Button size="icon" className="size-12 rounded-full [&_svg]:size-5" aria-label={playing ? "Pause" : "Play"} onClick={audio.toggle} disabled={busy}>
                  {busy ? <Loader2 className="animate-spin" /> : playing ? <Pause /> : <Play className="ml-0.5" />}
                </Button>
                <Button variant="ghost" size="icon" aria-label="Next segment" onClick={() => audio.skip(1)} disabled={busy || segment >= briefing.segments.length - 1}><SkipForward /></Button>
              </div>
              <div role="group" aria-label="Playback speed" className="flex items-center gap-0.5 rounded-xl bg-fg/5 p-0.5">
                {RATES.map((r) => (
                  <button key={r} type="button" aria-pressed={audio.rate === r} onClick={() => audio.setRate(r)}
                    className={cn("rounded-lg px-2 py-1 text-xs font-semibold tabular-nums transition-all", audio.rate === r ? "bg-bg-elev shadow-sm text-fg" : "text-fg-muted hover:text-fg")}>{r}×</button>
                ))}
              </div>
              <div className="ml-auto flex items-center gap-1">
                <Button variant="ghost" size="sm" onClick={copy}><Copy />Copy</Button>
                <Button variant="secondary" size="sm" onClick={download}><Download />.txt</Button>
              </div>
            </div>
          </>
        )}
        {mode === "none" && (
          <div className="mt-3 flex items-center gap-1">
            <Button variant="ghost" size="sm" onClick={copy}><Copy />Copy transcript</Button>
            <Button variant="secondary" size="sm" onClick={download}><Download />Download .txt</Button>
          </div>
        )}
      </div>

      <Tabs value={tab} onValueChange={setTab} className="border-t border-border">
        <div className="px-4 sm:px-5 pt-3">
          <TabsList className="w-full sm:w-auto grid grid-cols-3 sm:inline-flex">
            <TabsTrigger value="segments">Segments <span className="text-fg-faint">{briefing.segments.length}</span></TabsTrigger>
            <TabsTrigger value="transcript">{meta.text ? "Read" : "Transcript"}</TabsTrigger>
            <TabsTrigger value="sources">Sources <span className="text-fg-faint">{briefing.sources.length}</span></TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="segments" className="p-4 sm:p-5 pt-3">
          <ol className="space-y-1">
            {briefing.segments.map((s, i) => (
              <li key={i}>
                <button type="button" onClick={() => audio.seekSegment(i)} disabled={mode === "none"} aria-current={i === segment ? "true" : undefined}
                  className={cn("flex w-full items-start gap-3 rounded-xl px-3 py-2 text-left transition-colors disabled:cursor-default", i === segment ? "bg-carolina-soft/60" : "hover:bg-fg/4")}>
                  <span className={cn("mt-0.5 grid size-6 shrink-0 place-items-center rounded-full text-[11px] font-semibold tabular-nums", i === segment ? "bg-carolina text-white" : "bg-fg/6 text-fg-muted")}>
                    {i === segment && playing ? <AudioLines className="size-3" /> : i + 1}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">{s.title}</span>
                    <span className="block truncate text-xs text-fg-muted">{s.text}</span>
                  </span>
                  {s.refs.length > 0 && <span className="ml-auto shrink-0 text-[11px] text-fg-faint">{s.refs.length} src</span>}
                </button>
              </li>
            ))}
          </ol>
        </TabsContent>

        <TabsContent value="transcript" className="p-4 sm:p-5 pt-3">
          <div ref={transcriptRef} className={cn("relative max-h-[480px] overflow-y-auto scrollbar-thin pr-1", meta.text && "max-h-none")}>
            <article className={cn("space-y-5", meta.text && "mx-auto max-w-prose")}>
              {briefing.segments.length ? briefing.segments.map((s, i) => (
                <section key={i} data-seg={i} className={cn("rounded-xl px-3 py-2 -mx-3 transition-colors", i === segment && state !== "idle" && !meta.text && "bg-carolina-soft/50")}>
                  <h3 className={cn("font-semibold tracking-tight", meta.text ? "text-base" : "text-xs uppercase tracking-wide text-fg-muted")}>{s.title}</h3>
                  <p className={cn("mt-1 whitespace-pre-line", meta.text ? "text-[15px] leading-7" : "text-sm leading-6")}>{s.text}</p>
                </section>
              )) : <p className="whitespace-pre-line text-sm leading-6">{briefing.script}</p>}
            </article>
          </div>
        </TabsContent>

        <TabsContent value="sources" className="p-4 sm:p-5 pt-3">
          {briefing.sources.length ? (
            <ul className="divide-y divide-border">
              {briefing.sources.map((s) => {
                const Icon = SOURCE_ICON[s.kind] ?? FileText;
                const inner = (
                  <>
                    <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-fg/6 text-fg-muted"><Icon className="size-4" /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{s.title}</span>
                      <span className="block text-[11px] text-fg-muted">{s.at ? fmtDateTime(s.at) : s.kind}</span>
                    </span>
                    <ExternalLink className="size-3.5 text-fg-faint shrink-0" />
                  </>
                );
                const cls = "flex items-center gap-3 py-2.5 hover:text-carolina transition-colors";
                return (
                  <li key={`${s.kind}:${s.id}`}>
                    {s.href.startsWith("http") ? <a href={s.href} target="_blank" rel="noreferrer" className={cls}>{inner}</a> : <Link href={s.href} className={cls}>{inner}</Link>}
                  </li>
                );
              })}
            </ul>
          ) : <p className="text-sm text-fg-muted">No sources were cited for this briefing.</p>}
        </TabsContent>
      </Tabs>
    </Card>
  );
}
