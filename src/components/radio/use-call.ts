"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/client";
import type { MascotState, StationLevels } from "./use-station";
import { followVoice, speechClockTarget, voiceTarget } from "./voice-level";
import { CallTurns, isPlaybackEcho } from "./call-speech";

export type CallPhase = "off" | "ringing" | "greeting" | "listening" | "thinking" | "speaking" | "goodbye";
export type CallLine = { role: "user" | "aqua"; text: string };
export type CallCard = { id: string; title: string; href: string; kind: string; at: number | null; isDemo: boolean; external: boolean };
type CallResponse = { reply: string; cards: CallCard[]; callerName: string | null; provider: string; endCall: boolean; draftContext: string | null; posted: { id: string; title: string; href: string } | null; acted: boolean };
type Rec = {
  lang: string; interimResults: boolean; continuous: boolean; maxAlternatives: number;
  onresult: ((e: { resultIndex: number; results: { isFinal: boolean; 0: { transcript: string } }[] }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void; stop(): void;
};
const srCtor = (): (new () => Rec) | null => {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: new () => Rec; webkitSpeechRecognition?: new () => Rec };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
};
const hasTts = () => typeof window !== "undefined" && "speechSynthesis" in window;

export function useCall(opts: { suspend: () => void; resume: () => void; emitFx: (name: "bounce" | "celebrate" | "wave") => void }) {
  const [phase, setPhase] = useState<CallPhase>("off");
  const [lines, setLines] = useState<CallLine[]>([]);
  const [interim, setInterim] = useState("");
  const [cards, setCards] = useState<CallCard[]>([]);
  const [callerName, setCallerName] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [micOn, setMicOn] = useState(true);
  const [voiceUsed, setVoiceUsed] = useState<"elevenlabs" | "browser" | null>(null);
  const [srAvailable] = useState(() => typeof window !== "undefined" && !!srCtor());
  const phaseRef = useRef<CallPhase>("off");
  const deadRef = useRef(true);
  const sessionRef = useRef("");
  const historyRef = useRef<CallLine[]>([]);
  const callerNameRef = useRef<string | null>(null);
  const draftRef = useRef<string | null>(null);
  const turnsRef = useRef(new CallTurns());
  const recRef = useRef<Rec | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const micOnRef = useRef(true);
  const playbackRef = useRef<AbortController | null>(null);
  const spokenRef = useRef("");
  const audioCtxRef = useRef<AudioContext | null>(null);
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const timeBufRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const speakingRef = useRef(false);
  const kickRef = useRef(0);
  const utterRef = useRef<SpeechSynthesisUtterance | null>(null);
  const levelsRef = useRef<StationLevels>({ voice: 0, music: 0 });
  const submitRef = useRef<(text: string) => Promise<void>>(async () => undefined);
  const listenRef = useRef<(duringSpeech?: boolean) => void>(() => undefined);
  const optsRef = useRef(opts);
  optsRef.current = opts;
  const setPhaseBoth = (p: CallPhase) => { phaseRef.current = p; setPhase(p); };
  const appendLine = useCallback((line: CallLine) => {
    historyRef.current = [...historyRef.current, line].slice(-14);
    setLines(historyRef.current);
  }, []);

  const stopPlayback = useCallback(() => {
    // Aborting settles playback promises even though pause() emits no ended event.
    playbackRef.current?.abort();
    playbackRef.current = null;
    audioElRef.current?.pause(); audioElRef.current = null;
    analyserRef.current = null; timeBufRef.current = null;
    if (hasTts()) window.speechSynthesis.cancel();
    utterRef.current = null; speakingRef.current = false;
    levelsRef.current.voice = 0;
  }, []);

  const stopListening = useCallback(() => {
    const rec = recRef.current;
    recRef.current = null;
    if (rec) {
      // Old callbacks must not restart recognition or submit duplicate results.
      rec.onresult = rec.onerror = rec.onend = null;
      try { rec.stop(); } catch { /* already stopped */ }
    }
  }, []);

  const interrupt = useCallback(() => {
    if (deadRef.current || !["speaking", "greeting", "thinking"].includes(phaseRef.current)) return;
    turnsRef.current.next(); stopPlayback();
    setPhaseBoth("listening"); listenRef.current();
  }, [stopPlayback]);

  const beginListening = useCallback((duringSpeech = false) => {
    if (deadRef.current) return;
    if (!duringSpeech) setPhaseBoth("listening");
    const Ctor = srCtor();
    if (!Ctor || !micOnRef.current || recRef.current) return;
    const rec = new Ctor();
    recRef.current = rec;
    rec.lang = "en-US"; rec.interimResults = true; rec.continuous = false; rec.maxAlternatives = 1;
    rec.onresult = (e) => {
      if (recRef.current !== rec || deadRef.current || !micOnRef.current) return;
      if (phaseRef.current !== "listening" && phaseRef.current !== "speaking") return;
      let text = "";
      let final = false;
      for (let i = e.resultIndex; i < e.results.length; i++) {
        text += `${e.results[i][0].transcript} `;
        final ||= e.results[i].isFinal;
      }
      text = text.trim();
      if (!text) return;
      if (phaseRef.current === "speaking") {
        if (isPlaybackEcho(text, spokenRef.current)) return;
        // Reuse the current recognizer to preserve the caller's opening words.
        interrupt();
      }
      setInterim(text);
      if (final) void submitRef.current(text);
    };
    rec.onerror = (e) => {
      if (recRef.current !== rec || deadRef.current) return;
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        setNotice("Microphone permission was blocked. Allow it in your browser or type below.");
        micOnRef.current = false; setMicOn(false); stopListening();
      } else if (e.error === "audio-capture" || e.error === "network") {
        setNotice("Speech recognition is unavailable. You can still type to Aqua."); stopListening();
      }
    };
    rec.onend = () => {
      if (recRef.current !== rec) return;
      recRef.current = null;
      if (!deadRef.current && micOnRef.current && ["listening", "speaking"].includes(phaseRef.current)) {
        listenRef.current(phaseRef.current === "speaking");
      }
    };
    try { rec.start(); } catch {
      recRef.current = null;
      setNotice("Microphone recognition couldn't start. Type below or toggle the microphone to retry.");
    }
  }, [interrupt, stopListening]);
  listenRef.current = beginListening;

  const speak = useCallback(async (text: string) => {
    stopPlayback();
    if (deadRef.current) return;
    const controller = new AbortController();
    const { signal } = controller;
    playbackRef.current = controller; spokenRef.current = text;
    listenRef.current(true);
    let url: string | null = null;
    let el: HTMLAudioElement | null = null;
    let src: MediaElementAudioSourceNode | null = null;
    let analyser: AnalyserNode | null = null;
    try {
      const res = await fetch("/api/radio/call/audio", {
        method: "POST", headers: { "content-type": "application/json" }, signal,
        body: JSON.stringify({ sessionId: sessionRef.current, text }),
      });
      if (!res.ok || !res.headers.get("content-type")?.includes("audio")) throw new Error("Use browser voice");
      const blob = await res.blob();
      if (signal.aborted || deadRef.current) return;
      url = URL.createObjectURL(blob);
      const ctx = audioCtxRef.current ?? (audioCtxRef.current = new AudioContext());
      if (ctx.state === "suspended") await ctx.resume();
      if (signal.aborted || deadRef.current) return;
      el = new Audio(url); audioElRef.current = el;
      src = ctx.createMediaElementSource(el); analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      src.connect(analyser); analyser.connect(ctx.destination);
      analyserRef.current = analyser; timeBufRef.current = new Uint8Array(analyser.fftSize);
      await new Promise<void>((resolve, reject) => {
        const audio = el!;
        let settled = false;
        const done = (error?: Error) => {
          if (settled) return;
          settled = true; clearTimeout(timer);
          signal.removeEventListener("abort", abort);
          audio.onended = audio.onerror = null; audio.pause();
          if (error) reject(error); else resolve();
        };
        const abort = () => done();
        const timer = setTimeout(() => done(), Math.max(5000, text.length * 120));
        audio.onended = () => done(); audio.onerror = () => done(new Error("Audio failed"));
        signal.addEventListener("abort", abort, { once: true });
        void audio.play().then(() => {
          if (signal.aborted || settled) { audio.pause(); return; }
          speakingRef.current = true; setVoiceUsed("elevenlabs");
        }).catch((error) => done(error));
      });
    } catch {
      if (signal.aborted || deadRef.current) return;
      el?.pause(); src?.disconnect(); analyser?.disconnect();
      if (analyserRef.current === analyser) analyserRef.current = null;
      if (!hasTts()) { setNotice("Voice playback is unavailable. Aqua's reply is shown above."); return; }
      setVoiceUsed("browser");
      await new Promise<void>((resolve) => {
        const synth = window.speechSynthesis;
        const parts = text.split(/(?<=[.!?…])\s+/).filter(Boolean);
        let index = 0;
        let finished = false;
        const done = () => {
          if (finished) return;
          finished = true; clearTimeout(timer);
          signal.removeEventListener("abort", done); synth.cancel(); resolve();
        };
        const timer = setTimeout(done, Math.max(5000, text.length * 120));
        signal.addEventListener("abort", done, { once: true });
        const next = () => {
          if (finished || signal.aborted || deadRef.current || index >= parts.length) return done();
          const u = new SpeechSynthesisUtterance(parts[index++]); utterRef.current = u;
          const en = synth.getVoices().filter((v) => v.lang.toLowerCase().startsWith("en"));
          const voice = en.find((v) => /natural|samantha|aria|jenny|google us english/i.test(v.name)) ?? en[0];
          if (voice) { u.voice = voice; u.lang = voice.lang; }
          u.rate = 1.04; u.pitch = 1.1;
          u.onstart = () => { if (!signal.aborted) speakingRef.current = true; };
          u.onboundary = () => { kickRef.current = performance.now(); };
          u.onend = next; u.onerror = done;
          synth.resume(); synth.speak(u);
        };
        synth.cancel(); setTimeout(next, 50);
      });
    } finally {
      el?.pause(); src?.disconnect(); analyser?.disconnect();
      if (url) URL.revokeObjectURL(url);
      // Old promises finishing must never clear a newer voice's state.
      if (playbackRef.current === controller) {
        playbackRef.current = null; audioElRef.current = null; analyserRef.current = null;
        speakingRef.current = false; utterRef.current = null;
      }
    }
  }, [stopPlayback]);

  const endCall = useCallback(async () => {
    if (deadRef.current) return;
    deadRef.current = true; turnsRef.current.next();
    stopListening(); stopPlayback();
    streamRef.current?.getTracks().forEach((t) => t.stop()); streamRef.current = null;
    void audioCtxRef.current?.close().catch(() => undefined); audioCtxRef.current = null;
    analyserRef.current = null; setPhaseBoth("off"); setInterim("");
    optsRef.current.emitFx("wave"); optsRef.current.resume();
    void api.post("/api/radio/call", { sessionId: sessionRef.current, action: "end" }).catch(() => undefined);
  }, [stopListening, stopPlayback]);

  const submit = useCallback(async (raw: string) => {
    const text = raw.trim();
    if (!text || deadRef.current || !["listening", "speaking", "greeting"].includes(phaseRef.current)) return;
    const turn = turnsRef.current.next();
    const history = historyRef.current.slice();
    stopListening(); stopPlayback(); setInterim(""); setNotice(null);
    appendLine({ role: "user", text }); setPhaseBoth("thinking");
    try {
      const r = await api.post<CallResponse>("/api/radio/call", { sessionId: sessionRef.current, action: "say", message: text, history, callerName: callerNameRef.current, draftContext: draftRef.current });
      if (deadRef.current || !turnsRef.current.current(turn)) return;
      if (r.callerName) { callerNameRef.current = r.callerName; setCallerName(r.callerName); }
      draftRef.current = r.draftContext ?? null;
      setCards(r.cards);
      if (r.provider !== "gemini" && !r.acted) {
        setNotice("Aqua's AI is unavailable right now. Try again shortly. Any matching campus posts are shown below.");
        if (r.endCall) { void endCall(); return; }
        beginListening(); return;
      }
      appendLine({ role: "aqua", text: r.reply }); setPhaseBoth("speaking");
      await speak(r.reply);
      if (deadRef.current || !turnsRef.current.current(turn)) return;
      if (r.endCall) { void endCall(); return; }
      beginListening();
    } catch (e) {
      if (deadRef.current || !turnsRef.current.current(turn)) return;
      setNotice((e as Error).message || "The call hit a snag."); beginListening();
    }
  }, [appendLine, beginListening, endCall, speak, stopListening, stopPlayback]);
  submitRef.current = submit;

  const startCall = useCallback(async () => {
    if (phaseRef.current !== "off") return;
    deadRef.current = false;
    const turn = turnsRef.current.next();
    sessionRef.current = `call_${Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
    historyRef.current = []; callerNameRef.current = null; draftRef.current = null;
    setLines([]); setCards([]); setCallerName(null); setNotice(null); setVoiceUsed(null); setPhaseBoth("ringing");
    optsRef.current.suspend(); optsRef.current.emitFx("bounce");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      if (deadRef.current || !turnsRef.current.current(turn)) { stream.getTracks().forEach((t) => t.stop()); return; }
      streamRef.current = stream;
      stream.getAudioTracks().forEach((t) => { t.enabled = micOnRef.current; });
    } catch {
      if (deadRef.current || !turnsRef.current.current(turn)) return;
      micOnRef.current = false; setMicOn(false); setNotice("No microphone. You can still type to Aqua below.");
    }
    if (!srCtor()) setNotice("This browser can't transcribe speech. Type below or use Chrome/Edge.");
    setPhaseBoth("greeting");
    try {
      const r = await api.post<CallResponse>("/api/radio/call", { sessionId: sessionRef.current, action: "start" });
      if (deadRef.current || !turnsRef.current.current(turn)) return;
      appendLine({ role: "aqua", text: r.reply }); setPhaseBoth("speaking");
      await speak(r.reply);
      if (!deadRef.current && turnsRef.current.current(turn)) beginListening();
    } catch (e) {
      if (deadRef.current || !turnsRef.current.current(turn)) return;
      setNotice((e as Error).message || "Couldn't reach the station."); beginListening();
    }
  }, [appendLine, beginListening, speak]);

  const toggleMic = useCallback(() => {
    const next = !micOnRef.current;
    micOnRef.current = next; setMicOn(next);
    streamRef.current?.getAudioTracks().forEach((t) => { t.enabled = next; });
    if (!next) stopListening();
    else if (phaseRef.current === "listening" || phaseRef.current === "speaking") beginListening(phaseRef.current === "speaking");
  }, [beginListening, stopListening]);

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const an = analyserRef.current, buf = timeBufRef.current;
      const value = an && buf ? voiceTarget(an, buf) : speakingRef.current ? speechClockTarget(kickRef.current) : 0;
      levelsRef.current.voice = followVoice(levelsRef.current.voice, value, speakingRef.current);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => () => {
    deadRef.current = true; turnsRef.current.next(); stopListening(); stopPlayback();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    void audioCtxRef.current?.close().catch(() => undefined);
  }, [stopListening, stopPlayback]);

  const mascot: MascotState = phase === "ringing" ? "tuning" : phase === "speaking" || phase === "greeting" || phase === "goodbye" ? "talking" : phase === "thinking" ? "thinking" : "listening";
  const status = { off: "", ringing: "Calling Aqua…", greeting: "Aqua picked up!", listening: micOn ? "Aqua is listening — go ahead!" : "Type to Aqua below", thinking: "Aqua is thinking…", speaking: "Aqua is speaking — you can interrupt", goodbye: "Wrapping up…" }[phase];
  return { active: phase !== "off", phase, mascot, status, lines, interim, cards, callerName, notice, micOn, srAvailable, voiceUsed, levelsRef, startCall, endCall, toggleMic, submit, interrupt };
}
export type Call = ReturnType<typeof useCall>;
