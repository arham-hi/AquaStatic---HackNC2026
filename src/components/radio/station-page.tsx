"use client";
// /radio — the 24/7 station. Aqua the mascot is the centerpiece; Tune in starts the music bed,
// and real campus activity becomes spoken segments that duck the music while Aqua talks.

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AudioLines, Ear, EarOff, ExternalLink, ListMusic, Mic, Music2, Phone, Radio, RadioTower, SkipForward, Sparkles, Volume2, VolumeX } from "lucide-react";
import { Page } from "@/components/shell/app-shell";
import { Badge } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";
import { timeAgo, fmtTime } from "@/lib/time";
import { AquaMascot } from "./mascot/aqua-mascot";
import { KIND_LABEL, useStation, type StationSegment } from "./use-station";
import { useCall } from "./use-call";
import { CallPanel } from "./call-panel";
import { Visualizer } from "./visualizer";

// "Hey Aqua" / "Okay Aqua" — opt-in hands-free wake word. Runs a dedicated recognition session
// only while the station is in music state and no call is active, so it can never self-trigger.
function useWakeWord(enabled: boolean, active: boolean, onWake: () => void) {
  const recRef = useRef<{ stop(): void } | null>(null);
  const onWakeRef = useRef(onWake);
  onWakeRef.current = onWake;
  useEffect(() => {
    if (!enabled || !active) { try { recRef.current?.stop(); } catch { /* noop */ } recRef.current = null; return; }
    const w = window as unknown as { SpeechRecognition?: new () => never; webkitSpeechRecognition?: new () => never };
    const Ctor = (w.SpeechRecognition ?? w.webkitSpeechRecognition) as (new () => {
      lang: string; interimResults: boolean; continuous: boolean;
      onresult: ((e: { resultIndex: number; results: { isFinal: boolean; 0: { transcript: string } }[] }) => void) | null;
      onend: (() => void) | null; onerror: (() => void) | null;
      start(): void; stop(): void;
    }) | null;
    if (!Ctor) return;
    let dead = false;
    const rec = new Ctor();
    recRef.current = rec;
    rec.lang = "en-US"; rec.interimResults = true; rec.continuous = true;
    rec.onresult = (e) => {
      for (let i = 0; i < e.results.length; i++) {
        if (/(hey|okay|ok|hi)\s+aqua/i.test(e.results[i][0].transcript)) { onWakeRef.current(); return; }
      }
    };
    rec.onend = () => { if (!dead) { try { rec.start(); } catch { /* busy */ } } };
    rec.onerror = () => { /* permission/engine errors end the session; toggle handles re-enable */ };
    try { rec.start(); } catch { /* noop */ }
    return () => { dead = true; try { rec.stop(); } catch { /* noop */ } recRef.current = null; };
  }, [enabled, active]);
}

const KIND_TONE: Record<string, "red" | "carolina" | "mint" | "violet" | "neutral"> = {
  alert: "red", update: "carolina", event_soon: "violet", roundup: "mint", time_check: "neutral", welcome: "carolina",
};

function NowTalkingAbout({ seg }: { seg: StationSegment }) {
  const src = seg.sources[0];
  if (!src) return <p className="text-sm text-fg-muted">Station chatter — nothing to link this time.</p>;
  const inner = (
    <>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">{src.title}</span>
        <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-fg-muted">
          <Badge tone="neutral" className="capitalize">{src.kind}</Badge>
          {src.isDemo && <Badge tone="amber">DEMO</Badge>}
          {src.at ? <span>{fmtTime(src.at)}</span> : null}
        </span>
      </span>
      <ExternalLink className="size-4 shrink-0 text-fg-faint" />
    </>
  );
  const cls = "flex items-center gap-3 rounded-2xl border border-border bg-bg-elev/60 px-4 py-3 transition-colors hover:border-carolina/40 hover:text-carolina";
  return src.href.startsWith("http")
    ? <a href={src.href} target="_blank" rel="noreferrer" className={cls}>{inner}</a>
    : <Link href={src.href} className={cls}>{inner}</Link>;
}

export function StationPage() {
  const st = useStation();
  const call = useCall({ suspend: st.suspendStation, resume: st.resumeStation, emitFx: st.emitFx });
  const kickRef = useRef(0);
  const talking = st.speaking && st.current;
  const [handsFree, setHandsFree] = useState(false);
  // Wake word only listens while music is playing and no call is active — never during speech.
  useWakeWord(handsFree, st.status === "music" && !call.active, () => void call.startCall());
  const [, setTick] = useState(0); // 1s heartbeat for the "next update" countdown
  useEffect(() => {
    if (!st.tunedIn) return;
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [st.tunedIn]);

  const mascotState = call.active ? call.mascot : st.mascot;
  const mascotLevels = call.active ? call.levelsRef : st.levelsRef;

  const statusLabel = call.active ? "Live call" : !st.tunedIn ? "Off air"
    : st.status === "tuning" ? "Tuning in…"
    : st.muted ? "Muted"
    : talking ? "Aqua is speaking"
    : "Music playing";
  const nextPollIn = st.tunedIn && st.lastPollAtRef.current ? Math.max(0, 10 - Math.floor((Date.now() - st.lastPollAtRef.current) / 1000)) : null;

  return (
    <Page
      title="Aqua Static Radio"
      subtitle="Aqua FM — Chapel Hill's campus, live. Aqua reads the real board and keeps the music going between updates."
      actions={
        <div className="flex items-center gap-1.5">
          <Badge tone={st.tunedIn ? "mint" : "neutral"}><RadioTower className="size-3" />{st.tunedIn ? "ON AIR" : "Standby"}</Badge>
          {st.tunedIn && <Badge tone={st.voiceLabel.includes("ElevenLabs") ? "mint" : "neutral"}><Mic className="size-3" />{st.voiceLabel}</Badge>}
        </div>
      }
    >
      {/* ---- hero: Aqua on the glass stage ---- */}
      <section aria-label="Aqua, your station host" className="relative overflow-hidden rounded-[30px] glass-strong">
        <div aria-hidden className="absolute inset-0 bg-gradient-to-b from-sky-200/70 via-cyan-100/40 to-mint-soft/40" />
        <div aria-hidden className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_-10%,rgba(255,255,255,0.85),transparent_55%)]" />
        <span aria-hidden className="bubble" style={{ width: 90, height: 90, left: "8%", top: "14%", animationDelay: "-2s" }} />
        <span aria-hidden className="bubble" style={{ width: 46, height: 46, left: "16%", top: "58%", animationDelay: "-5s" }} />
        <span aria-hidden className="bubble" style={{ width: 120, height: 120, right: "7%", top: "10%", animationDelay: "0s" }} />
        <span aria-hidden className="bubble" style={{ width: 34, height: 34, right: "18%", top: "62%", animationDelay: "-7s" }} />

        <div className="relative">
          <AquaMascot state={mascotState} levels={mascotLevels} fx={st.fxRef} className="relative mx-auto h-[300px] w-full max-w-[560px] sm:h-[390px]" />
          <div className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2">
            <Badge tone={call.active || talking ? "carolina" : st.tunedIn ? "mint" : "neutral"} className="shadow-sm">
              <AudioLines className="size-3" />{call.active ? call.status : statusLabel}
            </Badge>
          </div>
        </div>
      </section>

      {/* ---- controls ---- */}
      <section aria-label="Radio controls" className="mt-4 flex flex-wrap items-center gap-3 rounded-[24px] glass px-4 py-3.5 sm:px-5">
        {!st.tunedIn ? (
          <button
            type="button"
            onClick={st.tuneIn}
            className="btn-aero aero-button inline-flex h-13 items-center gap-2.5 rounded-full px-7 text-base font-bold text-white"
          >
            <Radio className="size-5" /> Tune in
          </button>
        ) : call.active ? (
          <Badge tone="carolina" className="px-3 py-2"><Phone className="size-3.5" />On a call — the station is parked</Badge>
        ) : (
          <>
            <button type="button" onClick={st.tuneOut} className="btn-aero aero-button inline-flex h-11 items-center gap-2 rounded-full px-5 text-sm font-bold text-white" aria-label="Tune out">
              <Radio className="size-4" /> On air
            </button>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={st.toggleMute}
                aria-pressed={st.muted}
                aria-label={st.muted ? "Unmute" : "Mute"}
                className={cn("aero-button grid size-11 place-items-center rounded-full border border-border bg-bg-elev/80 transition-colors", st.muted ? "text-amber" : "text-fg hover:text-carolina")}
              >
                {st.muted ? <VolumeX className="size-5" /> : <Volume2 className="size-5" />}
              </button>
              <button
                type="button"
                onClick={st.skip}
                disabled={!st.speaking}
                aria-label="Skip segment"
                className="aero-button grid size-11 place-items-center rounded-full border border-border bg-bg-elev/80 text-fg transition-colors hover:text-carolina disabled:opacity-40"
              >
                <SkipForward className="size-5" />
              </button>
            </div>
            <button
              type="button"
              onClick={() => void call.startCall()}
              className="btn-aero aero-button inline-flex h-11 items-center gap-2 rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 px-5 text-sm font-bold text-white"
              aria-label="Call Aqua"
            >
              <Phone className="size-4" /> Call Aqua
            </button>
            <button
              type="button"
              onClick={() => setHandsFree((v) => !v)}
              aria-pressed={handsFree}
              title={handsFree ? 'Hands-free on — say "Hey Aqua"' : "Enable hands-free wake word"}
              className={cn("aero-button inline-flex h-11 items-center gap-1.5 rounded-full border border-border bg-bg-elev/80 px-3 text-xs font-semibold transition-colors",
                handsFree ? "text-violet-600 border-violet-300" : "text-fg-muted hover:text-carolina")}
            >
              {handsFree ? <Ear className="size-4" /> : <EarOff className="size-4" />}
              {handsFree ? 'Say "Hey Aqua"' : "Hands-free"}
            </button>
          </>
        )}

        <div className="min-w-0 flex-1">
          <Visualizer analyser={st.musicAnalyser} active={st.tunedIn && !st.muted} kickRef={kickRef} className="h-10 text-carolina/80" />
        </div>
        <div className="hidden text-right sm:block">
          <p className="text-xs font-medium text-fg-muted">{statusLabel}</p>
          {st.tunedIn && (
            <p className="text-[11px] text-fg-faint">
              {st.queueLength > 0 ? `Next up: ${st.queueLength} segment${st.queueLength === 1 ? "" : "s"}` : nextPollIn != null ? `Next update ~${nextPollIn}s` : "Listening for new posts"}
            </p>
          )}
        </div>
      </section>

      {st.audioError && (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-amber" role="alert">
          <Badge tone="amber">Audio error</Badge> {st.audioError}
        </p>
      )}
      {st.notice && <p className="mt-2 text-xs text-amber">{st.notice}</p>}

      {/* ---- live call takes over the middle of the page ---- */}
      {call.active && <CallPanel call={call} />}

      {/* ---- on air ---- */}
      {!call.active && (
      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <section aria-label="Now on air" className="card rounded-[24px] p-5">
          <div className="aero-eyebrow !mb-2"><AudioLines className="size-3" /> Now on air</div>
          <p className="min-h-12 text-[15px] leading-6 text-balance">
            {talking ? `“${st.current!.text}”` : st.tunedIn ? "♪ The Aqua FM music bed is up — Aqua will jump in the moment something happens on campus." : "Aqua Static Radio · Chapel Hill's campus, live. Tap to tune in."}
          </p>
          {talking && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <Badge tone={KIND_TONE[st.current!.kind]}>{KIND_LABEL[st.current!.kind]}</Badge>
              {st.current!.includesDemo && <Badge tone="amber">Includes demo data</Badge>}
            </div>
          )}
        </section>

        <section aria-label="Now talking about" className="card rounded-[24px] p-5">
          <div className="aero-eyebrow !mb-2"><Sparkles className="size-3" /> Now talking about</div>
          {talking ? <NowTalkingAbout seg={st.current!} /> : (
            <p className="text-sm text-fg-muted min-h-12">
              {st.tunedIn ? "Waiting for the next segment — posts, events and alerts land here as they're announced." : "Tune in and Aqua will link every story back to its real post, event or alert."}
            </p>
          )}
        </section>
      </div>
      )}

      {/* ---- recent segments ---- */}
      <section aria-label="Recent segments" className="mt-4 card rounded-[24px] p-5">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="aero-eyebrow !mb-0"><ListMusic className="size-3" /> Recent segments</div>
          <Link href="/radio/studio" className="inline-flex items-center gap-1.5 text-xs font-semibold text-carolina hover:underline">
            <Music2 className="size-3.5" /> Open the briefing studio
          </Link>
        </div>
        {st.recent.length === 0 ? (
          <p className="py-4 text-center text-sm text-fg-muted">The station log is empty — the first update, event or alert will show up here.</p>
        ) : (
          <ol className="divide-y divide-border">
            {st.recent.map((s) => (
              <li key={s.id} className="flex items-start gap-3 py-2.5">
                <Badge tone={KIND_TONE[s.kind]} className="mt-0.5 shrink-0">{KIND_LABEL[s.kind]}</Badge>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">{s.text}</p>
                  <p className="text-[11px] text-fg-faint">
                    {s.title} · {timeAgo(s.createdAt)}
                    {s.audioProvider === "elevenlabs" ? " · studio voice" : ""}
                    {s.includesDemo ? " · demo" : ""}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>
    </Page>
  );
}
