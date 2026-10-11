"use client";

// Demo-video only: plays pre-generated scripted lines (data/demo-voice/*.mp3 via
// /api/demo-voice/[clip]) while Aqua lip-syncs off the real waveform. The station is
// parked with the same suspend/resume a live call uses, so a playing segment is
// re-queued and the music bed returns exactly as it was. Never synthesizes audio.

import { useCallback, useEffect, useRef, useState } from "react";
import type { StationLevels } from "./use-station";
import { followVoice, voiceTarget } from "./voice-level";

export type DemoClip = "bus" | "events";

export function useDemoVoice(opts: { suspend: () => void; resume: () => void }) {
  const [playing, setPlaying] = useState<DemoClip | null>(null);
  const [error, setError] = useState<string | null>(null);
  const levelsRef = useRef<StationLevels>({ voice: 0, music: 0 });
  const optsRef = useRef(opts);
  optsRef.current = opts;

  const ctxRef = useRef<AudioContext | null>(null);
  const elRef = useRef<HTMLAudioElement | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const bufRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const urlRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const holdingRef = useRef(false); // station suspension held for this playback
  const speakingRef = useRef(false);
  const genRef = useRef(0);

  /** Stops the audio element only — leaves any station suspension in place. */
  const stopPlayback = useCallback(() => {
    genRef.current++;
    abortRef.current?.abort();
    abortRef.current = null;
    const el = elRef.current;
    if (el) { el.onended = null; el.onerror = null; el.pause(); el.src = ""; }
    elRef.current = null;
    analyserRef.current = null;
    bufRef.current = null;
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = null;
    speakingRef.current = false;
    setPlaying(null);
  }, []);

  /** Give the station back (music + re-queued segment resume on their own). */
  const release = useCallback(() => {
    if (!holdingRef.current) return;
    holdingRef.current = false;
    optsRef.current.resume();
  }, []);

  const stop = useCallback(() => { stopPlayback(); release(); }, [stopPlayback, release]);

  const play = useCallback(async (clip: DemoClip) => {
    setError(null);
    if (!holdingRef.current) { holdingRef.current = true; optsRef.current.suspend(); }
    stopPlayback();
    const gen = genRef.current;
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const res = await fetch(`/api/demo-voice/${clip}`, { signal: controller.signal });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? `Clip unavailable (HTTP ${res.status})`);
      }
      const url = URL.createObjectURL(await res.blob());
      if (gen !== genRef.current) { URL.revokeObjectURL(url); return; }
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      const ctx = (ctxRef.current ??= new Ctx());
      if (ctx.state === "suspended") await ctx.resume();
      if (gen !== genRef.current) { URL.revokeObjectURL(url); return; }
      const el = new Audio(url);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.6;
      ctx.createMediaElementSource(el).connect(analyser);
      analyser.connect(ctx.destination);
      el.onended = () => stop();
      el.onerror = () => { setError("Demo clip couldn't play."); stop(); };
      urlRef.current = url;
      elRef.current = el;
      analyserRef.current = analyser;
      bufRef.current = new Uint8Array(analyser.fftSize);
      setPlaying(clip);
      await el.play().then(() => { if (gen === genRef.current) speakingRef.current = true; });
    } catch (e) {
      if (gen !== genRef.current || controller.signal.aborted) return;
      if (gen === genRef.current) { setError((e as Error).message); stop(); }
    }
  }, [stop, stopPlayback]);

  // Mouth energy off the live waveform — identical envelope to station MP3 playback.
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const an = analyserRef.current, buf = bufRef.current;
      levelsRef.current.voice = followVoice(levelsRef.current.voice, an && buf ? voiceTarget(an, buf) : 0, speakingRef.current);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => () => {
    stop();
    void ctxRef.current?.close().catch(() => undefined);
  }, [stop]);

  return { playing, error, levelsRef, play, stop };
}

export type DemoVoice = ReturnType<typeof useDemoVoice>;
