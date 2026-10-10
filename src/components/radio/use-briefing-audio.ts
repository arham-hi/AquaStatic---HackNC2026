"use client";
// Playback for one briefing. Tries the ElevenLabs MP3 once (if the server has it configured), otherwise speaks
// segment-by-segment with the browser's speechSynthesis so segment skipping works on both paths.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { countWords, WPM, type ClientBriefing } from "./formats";

export type AudioMode = "unknown" | "mp3" | "tts" | "none";
export type PlayState = "idle" | "loading" | "playing" | "paused" | "ended";
export const RATES = [0.8, 1, 1.25, 1.5] as const;

const hasTts = () => typeof window !== "undefined" && "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;

function pickVoice(): SpeechSynthesisVoice | null {
  const en = window.speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith("en"));
  const score = (v: SpeechSynthesisVoice) =>
    (/natural|premium|enhanced|neural/i.test(v.name) ? 4 : 0) + (/google us english|samantha|aria|jenny|daniel|karen/i.test(v.name) ? 3 : 0) +
    (v.lang.toLowerCase() === "en-us" ? 2 : 0) + (v.default ? 1 : 0);
  return en.sort((a, b) => score(b) - score(a))[0] ?? null;
}

export function useBriefingAudio(briefing: ClientBriefing | null, preferMp3: boolean) {
  const [mode, setMode] = useState<AudioMode>("unknown");
  const [state, setState] = useState<PlayState>("idle");
  const [ttsSegment, setTtsSegment] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [mp3Duration, setMp3Duration] = useState(0);
  const [rate, setRateState] = useState<number>(1);
  const [notice, setNotice] = useState<string | null>(null);
  const [voiceName, setVoiceName] = useState<string | null>(null);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  const kickRef = useRef(0); // bumps on every spoken word boundary; the visualizer reads it

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const urlRef = useRef<string | null>(null);
  const genRef = useRef(0); // invalidates callbacks of cancelled utterances
  const pendingSegRef = useRef(0); // segment to start from once the playback path is decided
  const tts = useRef({ seg: 0, segStartedAt: 0, pausedAt: 0, pausedTotal: 0 });

  const segments = useMemo(() => briefing?.segments ?? [], [briefing]);
  const words = useMemo(() => segments.map((s) => countWords(s.text)), [segments]);
  const totalWords = Math.max(1, words.reduce((a, b) => a + b, 0) || briefing?.wordCount || 0);
  // cumWords[i] = words up to and including segment i
  const cumWords = useMemo(() => words.reduce<number[]>((acc, w, i) => [...acc, (acc[i - 1] ?? 0) + w], []), [words]);
  const wps = (WPM * rate) / 60;
  const duration = mode === "mp3" && mp3Duration ? mp3Duration : totalWords / wps;
  const segmentAt = useCallback((fraction: number) => {
    const i = cumWords.findIndex((c) => c / totalWords > fraction);
    return i === -1 ? Math.max(0, cumWords.length - 1) : i;
  }, [cumWords, totalWords]);

  const teardown = useCallback(() => {
    genRef.current++;
    if (hasTts()) window.speechSynthesis.cancel();
    audioRef.current?.pause();
    audioRef.current = null;
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = null;
    void ctxRef.current?.close().catch(() => undefined);
    ctxRef.current = null;
  }, []);

  // Reset everything when the briefing changes; tear down on unmount.
  useEffect(() => {
    setMode(!hasTts() && !preferMp3 ? "none" : "unknown");
    setState("idle"); setTtsSegment(0); setElapsed(0); setMp3Duration(0); setNotice(null); setVoiceName(null); setAnalyser(null);
    pendingSegRef.current = 0;
    if (hasTts()) window.speechSynthesis.getVoices(); // warms the voice list in Chrome
    return teardown;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- preferMp3 only matters at first play; don't reset playback when health polls
  }, [briefing?.id, teardown]);

  // ---------- browser speech ----------
  const speakFrom = useCallback((from: number, r = rate) => {
    const synth = window.speechSynthesis;
    synth.cancel();
    const gen = ++genRef.current;
    const voice = pickVoice();
    setVoiceName(voice?.name ?? null);
    setState("loading");
    // Some engines silently drop speak() right after cancel(); don't leave the play button stuck on "loading".
    const watchdog = setTimeout(() => { if (gen === genRef.current) { setState("idle"); setNotice("The browser voice didn't start. Press play to try again."); } }, 6000);
    segments.slice(from).forEach((seg, i) => {
      const idx = from + i;
      const u = new SpeechSynthesisUtterance(seg.text);
      u.rate = r;
      if (voice) u.voice = voice;
      u.lang = voice?.lang ?? "en-US";
      u.onstart = () => {
        if (gen !== genRef.current) return;
        clearTimeout(watchdog);
        tts.current = { seg: idx, segStartedAt: performance.now(), pausedAt: 0, pausedTotal: 0 };
        setTtsSegment(idx); setState("playing");
      };
      u.onboundary = () => { if (gen === genRef.current) kickRef.current++; };
      u.onend = () => { if (gen === genRef.current && idx === segments.length - 1) { setState("ended"); setElapsed(totalWords / ((WPM * r) / 60)); } };
      u.onerror = (e) => {
        if (gen !== genRef.current || e.error === "interrupted" || e.error === "canceled") return;
        setState("idle"); setNotice(`Browser voice stopped (${e.error}). Press play to try again.`);
      };
      synth.speak(u);
    });
  }, [segments, rate, totalWords]);

  // Elapsed ticker for speech (no timeupdate there) + Chrome keepalive (long remote utterances go silent after ~15s).
  useEffect(() => {
    if (mode !== "tts" || state !== "playing") return;
    const tick = setInterval(() => {
      const t = tts.current;
      const inSeg = Math.min((performance.now() - t.segStartedAt - t.pausedTotal) / 1000, (words[t.seg] ?? 0) / wps);
      setElapsed((cumWords[t.seg - 1] ?? 0) / wps + Math.max(0, inSeg));
    }, 200);
    const keepalive = setInterval(() => { window.speechSynthesis.pause(); window.speechSynthesis.resume(); }, 10_000);
    return () => { clearInterval(tick); clearInterval(keepalive); };
  }, [mode, state, wps, words, cumWords]);

  // ---------- mp3 ----------
  const setupMp3 = useCallback(async (id: string): Promise<{ ok: true } | { ok: false; reason: string | null }> => {
    let res: Response;
    try { res = await fetch(`/api/briefings/${id}/audio`); } catch (e) { return { ok: false, reason: (e as Error).message }; }
    if (!res.ok) {
      if (res.status === 503) return { ok: false, reason: null };
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      return { ok: false, reason: body?.error ?? `HTTP ${res.status}` };
    }
    const url = URL.createObjectURL(await res.blob());
    const a = new Audio(url);
    a.preload = "auto";
    a.playbackRate = rate;
    a.addEventListener("timeupdate", () => setElapsed(a.currentTime));
    a.addEventListener("durationchange", () => { if (Number.isFinite(a.duration)) setMp3Duration(a.duration); });
    a.addEventListener("play", () => setState("playing"));
    a.addEventListener("pause", () => { if (!a.ended) setState("paused"); });
    a.addEventListener("ended", () => setState("ended"));
    a.addEventListener("error", () => { setState("idle"); setNotice("Audio playback failed. Press play to retry."); });
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (Ctx) {
      const ctx = new Ctx();
      const an = ctx.createAnalyser();
      an.fftSize = 128;
      an.smoothingTimeConstant = 0.82;
      ctx.createMediaElementSource(a).connect(an);
      an.connect(ctx.destination);
      ctxRef.current = ctx;
      setAnalyser(an);
    }
    urlRef.current = url;
    audioRef.current = a;
    return { ok: true };
  }, [rate]);

  const mp3Play = useCallback(async () => {
    await ctxRef.current?.resume().catch(() => undefined);
    await audioRef.current?.play().catch((e: Error) => { setState("idle"); setNotice(`Couldn't start playback: ${e.message}`); });
  }, []);

  const mp3SeekSegment = useCallback((idx: number) => {
    const a = audioRef.current;
    if (!a) return;
    const go = () => { a.currentTime = ((cumWords[idx - 1] ?? 0) / totalWords) * (a.duration || 0); setElapsed(a.currentTime); };
    if (a.readyState >= 1) go(); else a.addEventListener("loadedmetadata", go, { once: true });
  }, [cumWords, totalWords]);

  // ---------- public controls ----------
  const play = useCallback(async () => {
    if (!briefing || !segments.length) return;
    if (mode === "mp3") return mp3Play();
    if (mode === "tts") {
      if (state === "paused") {
        tts.current.pausedTotal += performance.now() - tts.current.pausedAt;
        window.speechSynthesis.resume(); setState("playing");
      } else speakFrom(state === "ended" ? 0 : ttsSegment);
      return;
    }
    if (mode !== "unknown") return;
    setState("loading");
    const start = pendingSegRef.current;
    pendingSegRef.current = 0;
    if (preferMp3) {
      const r = await setupMp3(briefing.id);
      if (r.ok) { setMode("mp3"); if (start) mp3SeekSegment(start); return mp3Play(); }
      setNotice(r.reason ? `Voice service unavailable (${r.reason}). Using your browser's voice instead.` : "Studio voice isn't configured. Using your browser's voice instead.");
    }
    if (hasTts()) { setMode("tts"); speakFrom(start); } else { setMode("none"); setState("idle"); }
  }, [briefing, segments.length, mode, state, ttsSegment, preferMp3, setupMp3, speakFrom, mp3Play, mp3SeekSegment]);

  const pause = useCallback(() => {
    if (mode === "mp3") audioRef.current?.pause();
    else if (mode === "tts" && state === "playing") { window.speechSynthesis.pause(); tts.current.pausedAt = performance.now(); setState("paused"); }
  }, [mode, state]);

  const seekSegment = useCallback((i: number) => {
    const idx = Math.max(0, Math.min(segments.length - 1, i));
    if (mode === "mp3") { mp3SeekSegment(idx); if (audioRef.current?.paused) void mp3Play(); }
    else if (mode === "tts") speakFrom(idx);
    else if (mode === "unknown") { pendingSegRef.current = idx; setTtsSegment(idx); void play(); }
  }, [segments.length, mode, mp3SeekSegment, mp3Play, speakFrom, play]);

  const seekFraction = useCallback((f: number) => {
    const clamped = Math.max(0, Math.min(1, f));
    if (mode === "mp3" && audioRef.current) { audioRef.current.currentTime = clamped * (audioRef.current.duration || 0); setElapsed(audioRef.current.currentTime); return; }
    seekSegment(segmentAt(clamped));
  }, [mode, segmentAt, seekSegment]);

  const setRate = useCallback((r: number) => {
    setRateState(r);
    if (audioRef.current) audioRef.current.playbackRate = r;
    if (mode === "tts" && (state === "playing" || state === "paused")) speakFrom(tts.current.seg, r);
  }, [mode, state, speakFrom]);

  // Active segment: real for speech, estimated from word share for the MP3.
  const segment = mode === "mp3" ? segmentAt(duration ? elapsed / duration : 0) : ttsSegment;

  return {
    mode, state, segment, elapsed: Math.min(elapsed, duration || elapsed), duration, rate, notice, voiceName, analyser, kickRef,
    play, pause, setRate, seekSegment, seekFraction,
    toggle: () => (state === "playing" ? pause() : void play()),
    restart: () => seekSegment(0),
    skip: (d: number) => seekSegment(segment + d),
  };
}

export type BriefingAudio = ReturnType<typeof useBriefingAudio>;
