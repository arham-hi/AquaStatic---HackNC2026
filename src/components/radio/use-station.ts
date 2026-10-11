"use client";
// The station engine. Polls /api/station, keeps a playback queue, runs the music bed through a
// Web Audio graph, plays segments as cached MP3 (ElevenLabs) or browser speech, and exposes
// smoothed audio levels + a mascot state the 3D host reads every frame.

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/client";
import { onChange } from "@/hooks/useLive";
import { followVoice, rawRms, speechClockTarget, voiceTarget } from "./voice-level";

export type StationKind = "alert" | "update" | "event_soon" | "roundup" | "time_check" | "welcome";
export type StationStatus = "off_air" | "tuning" | "speaking" | "music";
export type MascotState = "idle" | "tuning" | "music" | "talking" | "alert" | "muted" | "listening" | "thinking" | "error";

export type SegmentSource = { kind: string; id: string; title: string; href: string; at: number | null; isDemo: boolean };

export type StationSegment = {
  id: string;
  kind: StationKind;
  title: string;
  text: string;
  sources: SegmentSource[];
  includesDemo: boolean;
  audioProvider: string;
  wordCount: number;
  createdAt: string;
};

type StationResponse = { segments: StationSegment[]; recent: StationSegment[]; latest: string | null };

export type StationLevels = { voice: number; music: number };
export type MascotFxName = "bounce" | "celebrate" | "wave";
export type MascotFx = { name: MascotFxName; t0: number } | null;

export const KIND_LABEL: Record<StationKind, string> = {
  alert: "Official alert",
  update: "Campus update",
  event_soon: "Event soon",
  roundup: "Roundup",
  time_check: "Time check",
  welcome: "Sign on",
};

const TRACKS = ["/music/aqua-drift.wav", "/music/static-tide.wav"];
const MUSIC_LEVEL = 0.55;
const DUCK_LEVEL = 0.12;
const RAMP = 0.4;

const WELCOME: StationSegment = {
  id: "welcome", kind: "welcome", title: "Sign on",
  text: "Hey Tar Heels! You're listening to Aqua FM, your campus companion. Let's see what's happening around Chapel Hill!",
  sources: [], includesDemo: false, audioProvider: "browser", wordCount: 20, createdAt: "",
};

/** Segments younger than this are still "live" — a listener tuning in now should hear them. */
const FRESH_SEGMENT_MS = 4 * 60 * 1000;

const hasTts = () => typeof window !== "undefined" && "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;
const sentences = (t: string) => t.split(/(?<=[.!?…])\s+/).map((s) => s.trim()).filter(Boolean);

function pickVoice(): SpeechSynthesisVoice | null {
  const en = window.speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith("en"));
  const score = (v: SpeechSynthesisVoice) =>
    (/natural|premium|enhanced|neural/i.test(v.name) ? 4 : 0) + (/google us english|samantha|aria|jenny|zira|karen/i.test(v.name) ? 3 : 0) +
    (v.lang.toLowerCase() === "en-us" ? 2 : 0) + (v.default ? 1 : 0);
  return en.sort((a, b) => score(b) - score(a))[0] ?? null;
}

export function useStation() {
  const [tunedIn, setTunedIn] = useState(false);
  const [muted, setMuted] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [current, setCurrent] = useState<StationSegment | null>(null);
  const [recent, setRecent] = useState<StationSegment[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [voiceMode, setVoiceMode] = useState<"mp3" | "tts" | "text" | null>(null);
  const [musicAnalyser, setMusicAnalyser] = useState<AnalyserNode | null>(null);
  const [tuning, setTuning] = useState(false);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [queueLength, setQueueLength] = useState(0);
  const lastPollAtRef = useRef(0);

  // Everything the 3D mascot reads per frame — refs, not state, so animation never re-renders React.
  const levelsRef = useRef<StationLevels>({ voice: 0, music: 0 });
  const fxRef = useRef<MascotFx>(null);
  const emitFx = useCallback((name: MascotFxName) => { fxRef.current = { name, t0: performance.now() }; }, []);

  const lastIdRef = useRef<string | null>(null);
  const queueRef = useRef<StationSegment[]>([]);
  const seenRef = useRef(new Set<string>());
  const genRef = useRef(0);
  const pumpingRef = useRef(false);
  const cancelPlaybackRef = useRef<(() => void) | null>(null);
  const tunedRef = useRef(false);
  const suspendedRef = useRef(false); // a live call parked the station — pump waits, queue preserved
  const currentRef = useRef<StationSegment | null>(null);
  const mutedRef = useRef(false);
  const ttsSpeakingRef = useRef(false);
  const mp3PlayingRef = useRef(false);
  const mp3BrokenUntilRef = useRef(0); // circuit breaker: after an audio-route failure, don't hammer it
  const kickRef = useRef(0);
  const utterRef = useRef<SpeechSynthesisUtterance[]>([]);

  const ctxRef = useRef<AudioContext | null>(null);
  const musicElRef = useRef<HTMLAudioElement | null>(null);
  const musicGainRef = useRef<GainNode | null>(null);
  const musicAnalyserRef = useRef<AnalyserNode | null>(null);
  const voiceElRef = useRef<HTMLAudioElement | null>(null);
  const voiceUrlRef = useRef<string | null>(null);
  const voiceGainRef = useRef<GainNode | null>(null);
  const voiceAnalyserRef = useRef<AnalyserNode | null>(null);
  const trackIdxRef = useRef(Math.floor(Math.random() * TRACKS.length));

  // ---------- music bed ----------
  const setMusicGain = useCallback((target: number) => {
    const ctx = ctxRef.current, g = musicGainRef.current;
    if (!ctx || !g) return;
    const t = ctx.currentTime;
    g.gain.cancelScheduledValues(t);
    g.gain.setValueAtTime(g.gain.value, t);
    g.gain.linearRampToValueAtTime(Math.max(0.0001, target), t + RAMP);
  }, []);

  const duckMusic = useCallback((speech: boolean) => {
    setMusicGain(mutedRef.current ? 0 : speech ? DUCK_LEVEL : MUSIC_LEVEL);
  }, [setMusicGain]);

  const nextTrack = useCallback(() => {
    const el = musicElRef.current;
    if (!el) return;
    trackIdxRef.current = (trackIdxRef.current + 1) % TRACKS.length;
    el.src = TRACKS[trackIdxRef.current];
    void el.play().catch(() => undefined);
  }, []);

  // ---------- playback ----------
  const stopVoiceElement = useCallback(() => {
    const a = voiceElRef.current;
    if (a) { a.onended = null; a.onerror = null; a.pause(); a.src = ""; }
    voiceElRef.current = null;
    if (voiceUrlRef.current) URL.revokeObjectURL(voiceUrlRef.current);
    voiceUrlRef.current = null;
    mp3PlayingRef.current = false;
  }, []);

  /** ElevenLabs MP3 through the voice analyser. Resolves true when it played (or was skipped); false → caller falls back to TTS. */
  const playMp3 = useCallback((seg: StationSegment) => new Promise<boolean>((resolve) => {
    const ctx = ctxRef.current, vGain = voiceGainRef.current, vAn = voiceAnalyserRef.current;
    if (!ctx || !vGain || !vAn || Date.now() < mp3BrokenUntilRef.current) return resolve(false);
    const gen = genRef.current;
    let settled = false;
    const done = (ok: boolean) => {
      if (settled) return;
      settled = true;
      if (gen === genRef.current) { stopVoiceElement(); }
      resolve(ok);
    };
    cancelPlaybackRef.current = () => done(true);
    fetch(`/api/station/${seg.id}/audio`)
      .then(async (res) => {
        if (!res.ok) {
          // 5xx/4xx here means the configured studio voice can't render — stop retrying for 2 min.
          mp3BrokenUntilRef.current = Date.now() + 120_000;
          return done(false);
        }
        const url = URL.createObjectURL(await res.blob());
        if (gen !== genRef.current) { URL.revokeObjectURL(url); return done(true); }
        const a = new Audio(url);
        a.preload = "auto";
        ctx.createMediaElementSource(a).connect(vGain);
        a.onended = () => done(true);
        a.onerror = () => done(mp3PlayingRef.current);
        voiceUrlRef.current = url;
        voiceElRef.current = a;
        setVoiceMode("mp3");
        void a.play().then(() => { mp3PlayingRef.current = true; }).catch(() => done(false));
      })
      .catch(() => done(false));
  }), [stopVoiceElement]);

  /** Browser speech, one utterance per sentence, boundary kicks drive the procedural mouth. */
  const speakSegment = useCallback((seg: StationSegment) => new Promise<void>((resolve) => {
    if (!hasTts()) return resolve();
    const synth = window.speechSynthesis;
    const parts = sentences(seg.text);
    if (!parts.length) return resolve();
    const gen = ++genRef.current;
    const voice = pickVoice();
    let idx = 0;
    let finished = false;
    let started = false;
    let errs = 0;
    const done = () => {
      if (finished) return;
      finished = true;
      clearTimeout(watchdog);
      ttsSpeakingRef.current = false;
      // Nothing ever started despite errors → the engine is blocked, not just a bad sentence.
      if (!started && errs > 0 && gen === genRef.current) {
        setAudioError("Speech was blocked by the browser — check sound/voice settings. Transcripts stay live.");
      }
      resolve();
    };
    cancelPlaybackRef.current = () => { synth.cancel(); done(); };
    const estMs = Math.max(4000, seg.wordCount * 420 + 5000);
    const watchdog = setTimeout(() => { synth.cancel(); done(); }, estMs);
    const next = () => {
      if (gen !== genRef.current || finished) return;
      if (idx >= parts.length) return done();
      const u = new SpeechSynthesisUtterance(parts[idx++]);
      if (voice) { u.voice = voice; u.lang = voice.lang; }
      u.rate = 1;
      u.pitch = 1.08; // a touch brighter — it's Aqua's voice
      u.volume = mutedRef.current ? 0 : 1;
      u.onstart = () => { if (gen === genRef.current) { started = true; ttsSpeakingRef.current = true; } };
      u.onboundary = () => { if (gen === genRef.current) kickRef.current = performance.now(); };
      u.onend = () => { if (gen === genRef.current && !finished) next(); };
      u.onerror = (e) => {
        if (e.error === "interrupted" || e.error === "canceled") { done(); return; }
        errs++;
        if (gen === genRef.current && !finished) next();
      };
      utterRef.current.push(u); // Chrome GCs unattached utterances and never fires events
      synth.resume(); // some engines park in paused state after a cancel()
      synth.speak(u);
    };
    setVoiceMode("tts");
    synth.cancel(); // clears leftovers; some engines drop speak() fired in the same tick
    setTimeout(next, 60);
  }), []);

  /** No MP3 and no TTS: show the text, hold for a readable beat, move on. */
  const readSilently = useCallback((seg: StationSegment) => new Promise<void>((resolve) => {
    const t = setTimeout(resolve, Math.min(30_000, Math.max(4000, seg.wordCount * 350)));
    cancelPlaybackRef.current = () => { clearTimeout(t); resolve(); };
  }), []);

  const pump = useCallback(async () => {
    if (pumpingRef.current) return;
    pumpingRef.current = true;
    try {
      for (;;) {
        if (suspendedRef.current) { setCurrent(null); currentRef.current = null; setSpeaking(false); return; }
        const seg = queueRef.current.shift();
        setQueueLength(queueRef.current.length);
        if (!seg) { setCurrent(null); currentRef.current = null; setSpeaking(false); duckMusic(false); return; }
        setCurrent(seg);
        currentRef.current = seg;
        setSpeaking(true);
        duckMusic(true);
        if (seg.kind !== "alert" && seg.kind !== "time_check") emitFx(/found|matched|resolved|picked up|thanks|won|free food/i.test(seg.text) ? "celebrate" : "bounce");
        let ok = false;
        if (seg.audioProvider === "elevenlabs") ok = await playMp3(seg);
        if (!ok) {
          if (hasTts()) await speakSegment(seg);
          else { setVoiceMode("text"); await readSilently(seg); }
        }
        stopVoiceElement();
      }
    } finally {
      pumpingRef.current = false;
      ttsSpeakingRef.current = false;
      setSpeaking(false);
      setCurrent(null);
      currentRef.current = null;
      duckMusic(false);
    }
  }, [duckMusic, emitFx, playMp3, readSilently, speakSegment, stopVoiceElement]);

  const enqueue = useCallback((segs: StationSegment[]) => {
    const fresh = segs.filter((s) => !seenRef.current.has(s.id));
    for (const s of fresh) seenRef.current.add(s.id);
    if (!fresh.length) return;
    // Official alerts jump to the front of the line (never interrupting what's already speaking).
    queueRef.current.push(...fresh.filter((s) => s.kind !== "alert"));
    queueRef.current.unshift(...fresh.filter((s) => s.kind === "alert"));
    setQueueLength(queueRef.current.length);
    void pump();
  }, [pump]);

  // ---------- station polling ----------
  useEffect(() => {
    let dead = false;
    const poll = async () => {
      try {
        const r = await api.get<StationResponse>(`/api/station?after=${lastIdRef.current ?? ""}`);
        if (dead) return;
        lastPollAtRef.current = Date.now();
        setRecent(r.recent);
        if (!tunedRef.current) { lastIdRef.current = r.latest; return; } // skip backlog; tuning in joins live
        if (r.segments.length) {
          lastIdRef.current = r.segments[r.segments.length - 1].id;
          enqueue(r.segments);
        } else if (lastIdRef.current && r.latest && !r.recent.some((s) => s.id === lastIdRef.current)) {
          lastIdRef.current = r.latest; // our cursor fell off the window; resync
        }
      } catch { /* keep polling; a bad tick just delays a segment */ }
    };
    void poll();
    const t = setInterval(poll, 10_000);
    const off = onChange((scope) => { if (scope === "posts" || scope === "briefings") void poll(); });
    return () => { dead = true; clearInterval(t); off(); };
  }, [enqueue]);

  // ---------- amplitude sampler (mascot mouth / speaker energy) ----------
  useEffect(() => {
    let raf = 0;
    const buf = new Uint8Array(1024);
    const tick = () => {
      const l = levelsRef.current;
      // Voice: real RMS for MP3; a boundary-kicked syllable pattern for browser speech.
      const mp3 = mp3PlayingRef.current, tts = ttsSpeakingRef.current;
      let v = 0;
      if (!mutedRef.current) {
        if (mp3) v = voiceTarget(voiceAnalyserRef.current, buf);
        else if (tts) v = speechClockTarget(kickRef.current);
      }
      l.voice = followVoice(l.voice, v, mp3 || tts);
      const m = tunedRef.current && !mutedRef.current ? Math.min(1, rawRms(musicAnalyserRef.current, buf) * 2.6) : 0;
      l.music += (m - l.music) * 0.25;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  // ---------- controls ----------
  const tuneIn = useCallback(async () => {
    if (tunedRef.current) return;
    // Speech is the point of the station — say so immediately if this browser can't do it.
    if (!hasTts()) setAudioError("This browser can't speak — Aqua will show transcripts instead. Try Chrome, Edge or Safari for full audio.");
    else window.speechSynthesis.getVoices(); // prime the voice list inside the user gesture
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (Ctx) {
      const ctx = new Ctx();
      void ctx.resume(); // some browsers open suspended even inside a gesture
      const mGain = ctx.createGain();
      const mAn = ctx.createAnalyser();
      const vGain = ctx.createGain();
      const vAn = ctx.createAnalyser();
      mAn.fftSize = 512; mAn.smoothingTimeConstant = 0.8;
      vAn.fftSize = 512; vAn.smoothingTimeConstant = 0.6;
      mGain.gain.value = 0; vGain.gain.value = 1;
      mGain.connect(mAn); mAn.connect(ctx.destination);
      vGain.connect(vAn); vAn.connect(ctx.destination);
      const el = new Audio(TRACKS[trackIdxRef.current]);
      el.addEventListener("ended", nextTrack);
      el.addEventListener("error", () => setNotice("The music file didn't load — voice still works."));
      ctx.createMediaElementSource(el).connect(mGain);
      ctxRef.current = ctx; musicElRef.current = el;
      musicGainRef.current = mGain; musicAnalyserRef.current = mAn;
      voiceGainRef.current = vGain; voiceAnalyserRef.current = vAn;
      setMusicAnalyser(mAn);
      void el.play().then(() => setMusicGain(MUSIC_LEVEL)).catch(() => setNotice("Couldn't start the music bed — voice will still play."));
    }
    tunedRef.current = true;
    setTunedIn(true);
    setTuning(true);
    setTimeout(() => setTuning(false), 1400);
    emitFx("bounce");
    seenRef.current.add(WELCOME.id);
    enqueue([WELCOME]);
    // Right behind the welcome: the freshest real segment (a server plan runs inside this GET too).
    void api.get<StationResponse>(`/api/station?after=${lastIdRef.current ?? ""}`)
      .then((r) => {
        lastPollAtRef.current = Date.now();
        setRecent(r.recent);
        const playNow = r.segments.length ? r.segments : r.recent.filter((s) => Date.now() - new Date(s.createdAt).getTime() < FRESH_SEGMENT_MS).slice(0, 1);
        if (r.segments.length) lastIdRef.current = r.segments[r.segments.length - 1].id;
        else if (playNow.length) lastIdRef.current = playNow[0].id;
        enqueue(playNow);
      })
      .catch(() => undefined);
  }, [emitFx, enqueue, nextTrack, setMusicGain]);

  const tuneOut = useCallback(() => {
    suspendedRef.current = false;
    genRef.current++;
    cancelPlaybackRef.current?.();
    queueRef.current = [];
    if (hasTts()) window.speechSynthesis.cancel();
    stopVoiceElement();
    musicElRef.current?.pause();
    musicElRef.current = null;
    void ctxRef.current?.close().catch(() => undefined);
    ctxRef.current = null;
    musicGainRef.current = null; musicAnalyserRef.current = null;
    voiceGainRef.current = null; voiceAnalyserRef.current = null;
    setMusicAnalyser(null);
    tunedRef.current = false;
    setTunedIn(false); setMuted(false); mutedRef.current = false;
    setSpeaking(false); setCurrent(null); setTuning(false); setVoiceMode(null); setAudioError(null); setQueueLength(0);
    levelsRef.current.voice = 0; levelsRef.current.music = 0;
    // Stay caught up so tuning back in joins live rather than replaying the gap.
    void api.get<StationResponse>(`/api/station?after=${lastIdRef.current ?? ""}`).then((r) => { lastIdRef.current = r.latest; }).catch(() => undefined);
  }, [stopVoiceElement]);

  const toggleMute = useCallback(() => {
    const next = !mutedRef.current;
    mutedRef.current = next;
    setMuted(next);
    if (!next) setMusicGain(pumpingRef.current ? DUCK_LEVEL : MUSIC_LEVEL);
    else setMusicGain(0);
    const vGain = voiceGainRef.current, ctx = ctxRef.current;
    if (vGain && ctx) {
      vGain.gain.cancelScheduledValues(ctx.currentTime);
      vGain.gain.setValueAtTime(vGain.gain.value, ctx.currentTime);
      vGain.gain.linearRampToValueAtTime(next ? 0.0001 : 1, ctx.currentTime + 0.25);
    }
    // In-flight TTS can't change volume; drop the current sentence so silence is immediate.
    if (next && ttsSpeakingRef.current && hasTts()) window.speechSynthesis.cancel();
  }, [setMusicGain]);

  const skip = useCallback(() => {
    cancelPlaybackRef.current?.();
  }, []);

  // ---------- live call integration: park the station, keep the queue ----------
  const suspendStation = useCallback(() => {
    if (suspendedRef.current) return;
    suspendedRef.current = true;
    // Put the in-flight segment back at the head so nothing is lost.
    if (currentRef.current) {
      queueRef.current.unshift(currentRef.current);
      setQueueLength(queueRef.current.length);
      seenRef.current.delete(currentRef.current.id);
      currentRef.current = null;
    }
    cancelPlaybackRef.current?.(); // resolves the active playback → pump parks at the loop top
    if (hasTts()) window.speechSynthesis.cancel();
    stopVoiceElement();
    setSpeaking(false);
    setCurrent(null);
    setMusicGain(0);
  }, [setMusicGain, stopVoiceElement]);

  const resumeStation = useCallback(() => {
    if (!suspendedRef.current) return;
    suspendedRef.current = false;
    if (tunedRef.current && musicElRef.current) {
      void musicElRef.current.play().catch(() => undefined);
      setMusicGain(mutedRef.current ? 0 : MUSIC_LEVEL);
    }
    void pump();
  }, [pump, setMusicGain]);

  // ---------- derived states ----------
  const mascot: MascotState = !tunedIn ? "idle" : muted ? "muted" : tuning ? "tuning" : speaking ? (current?.kind === "alert" ? "alert" : "talking") : "music";

  // One playback state machine for the UI: off_air → tuning → speaking ↔ music.
  const status: StationStatus = !tunedIn ? "off_air" : tuning ? "tuning" : speaking ? "speaking" : "music";
  const voiceLabel = voiceMode === "mp3" ? "ElevenLabs voice" : voiceMode === "tts" ? "Browser voice" : current?.audioProvider === "elevenlabs" ? "ElevenLabs voice" : "Browser voice";

  return {
    tunedIn, muted, speaking, current, recent, notice, mascot, status, audioError, voiceLabel, musicAnalyser, queueLength,
    levelsRef, fxRef, emitFx, lastPollAtRef,
    tuneIn, tuneOut, toggleMute, skip, suspendStation, resumeStation,
  };
}

export type Station = ReturnType<typeof useStation>;
