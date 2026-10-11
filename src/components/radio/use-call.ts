"use client";
// Live Call mode — a half-duplex voice conversation with Aqua.
// USER SPEAKS → AQUA THINKS → AQUA SPEAKS → repeat. Recognition is hard-stopped while Aqua
// talks so the host can never hear itself and loop.

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/client";
import type { MascotState, StationLevels } from "./use-station";

export type CallPhase = "off" | "ringing" | "greeting" | "listening" | "thinking" | "speaking" | "goodbye";
export type CallLine = { role: "user" | "aqua"; text: string };
export type CallCard = { id: string; title: string; href: string; kind: string; at: number | null; isDemo: boolean; external: boolean };

type CallResponse = { reply: string; cards: CallCard[]; callerName: string | null; provider: string; endCall: boolean };

// Minimal structural type for the vendor-prefixed SpeechRecognition API (not in TS's DOM lib everywhere).
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

const sentences = (t: string) => t.split(/(?<=[.!?…])\s+/).map((s) => s.trim()).filter(Boolean);

const LISTEN_TIMEOUT = 16_000;

export function useCall(opts: {
  suspend: () => void;
  resume: () => void;
  emitFx: (name: "bounce" | "celebrate" | "wave") => void;
}) {
  const [phase, setPhase] = useState<CallPhase>("off");
  const [lines, setLines] = useState<CallLine[]>([]);
  const [interim, setInterim] = useState("");
  const [cards, setCards] = useState<CallCard[]>([]);
  const [callerName, setCallerName] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [micOn, setMicOn] = useState(true);
  const [srAvailable] = useState(() => (typeof window !== "undefined" ? !!srCtor() : false));

  const levelsRef = useRef<StationLevels>({ voice: 0, music: 0 });
  const phaseRef = useRef<CallPhase>("off");
  const sessionRef = useRef("");
  const recRef = useRef<Rec | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const micOnRef = useRef(true);
  const speakingRef = useRef(false);
  const kickRef = useRef(0);
  const listenTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nudgedRef = useRef(false);
  const deadRef = useRef(true);
  const utterRef = useRef<SpeechSynthesisUtterance[]>([]);
  const submitRef = useRef<(t: string) => Promise<void>>(async () => undefined);

  const setPhaseBoth = (p: CallPhase) => { phaseRef.current = p; setPhase(p); };

  // ---------- Aqua's voice (call TTS drives the same levelsRef the mascot reads) ----------
  const speak = useCallback((text: string) => new Promise<void>((resolve) => {
    if (!hasTts() || deadRef.current) { speakingRef.current = false; return resolve(); }
    const synth = window.speechSynthesis;
    const parts = sentences(text);
    const voice = (() => {
      const en = synth.getVoices().filter((v) => v.lang.toLowerCase().startsWith("en"));
      return en.find((v) => /natural|samantha|aria|jenny|google us english/i.test(v.name)) ?? en[0] ?? null;
    })();
    let i = 0;
    let finished = false;
    const done = () => { if (finished) return; finished = true; speakingRef.current = false; clearTimeout(wd); resolve(); };
    const wd = setTimeout(done, Math.max(5000, text.length * 120));
    const next = () => {
      if (finished || deadRef.current) return done();
      if (i >= parts.length) return done();
      const u = new SpeechSynthesisUtterance(parts[i++]);
      if (voice) { u.voice = voice; u.lang = voice.lang; }
      u.rate = 1.04; u.pitch = 1.1;
      u.onstart = () => { speakingRef.current = true; };
      u.onboundary = () => { kickRef.current = performance.now(); };
      u.onend = () => next();
      u.onerror = (e) => { if (e.error === "interrupted" || e.error === "canceled") done(); else next(); };
      utterRef.current.push(u);
      synth.resume();
      synth.speak(u);
    };
    synth.cancel();
    setTimeout(next, 50);
  }), []);

  // procedural mouth energy while call TTS runs (mirrors the station's TTS pattern)
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const l = levelsRef.current;
      let v = 0;
      if (speakingRef.current) {
        const t = performance.now() / 1000;
        const kick = Math.max(0, 1 - (performance.now() - kickRef.current) / 450);
        const syll = Math.max(0, Math.sin(t * 10.7) * 0.6 + Math.sin(t * 17.3) * 0.4);
        const gate = 0.35 + 0.65 * Math.max(0, Math.sin(t * 2.3) * 0.7 + Math.sin(t * 5.1) * 0.3);
        v = Math.min(1, (0.25 + 0.75 * syll) * gate + kick * 0.5);
      }
      l.voice += (v - l.voice) * 0.4;
      if (l.voice < 0.01) l.voice = 0;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  // ---------- listening ----------
  const stopListening = useCallback(() => {
    if (listenTimerRef.current) { clearTimeout(listenTimerRef.current); listenTimerRef.current = null; }
    try { recRef.current?.stop(); } catch { /* already stopped */ }
    recRef.current = null;
  }, []);

  const armListenTimeout = useCallback(() => {
    if (listenTimerRef.current) clearTimeout(listenTimerRef.current);
    listenTimerRef.current = setTimeout(() => {
      if (phaseRef.current !== "listening") return;
      stopListening();
      if (!nudgedRef.current) {
        nudgedRef.current = true;
        setPhaseBoth("speaking");
        void speak("Hellooo? You still there? Take your time — I'm a radio, I've got nowhere to be.").then(() => {
          if (phaseRef.current === "speaking") void beginListening();
        });
      } else {
        void endCallInner("Still quiet on your end — I'll hang up, but tap Call Aqua whenever you're back!");
      }
    }, LISTEN_TIMEOUT);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [speak, stopListening]);

  const beginListening = useCallback(async () => {
    if (deadRef.current) return;
    const Ctor = srCtor();
    if (!Ctor || !micOnRef.current) { setPhaseBoth("listening"); armListenTimeout(); return; } // typed fallback: wait for input
    stopListening();
    const rec = new Ctor();
    recRef.current = rec;
    rec.lang = "en-US";
    rec.interimResults = true;
    rec.continuous = false;
    rec.maxAlternatives = 1;
    let gotFinal = false;
    rec.onresult = (e) => {
      let text = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) { gotFinal = true; void submitRef.current(String(r[0].transcript)); }
        else text += r[0].transcript;
      }
      setInterim(text);
    };
    rec.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        setNotice("Mic permission was blocked — type to Aqua below, or allow the mic in your browser bar.");
        micOnRef.current = false; setMicOn(false);
      } else if (e.error === "audio-capture" || e.error === "network") {
        setNotice("Speech recognition glitched — typing works too.");
      }
      // "no-speech" / "aborted": the timeout or next turn handles it
    };
    rec.onend = () => {
      setInterim("");
      // No final result and still supposed to be listening → restart once (Chrome ends on silence).
      if (phaseRef.current === "listening" && !gotFinal && !deadRef.current) {
        try { rec.start(); } catch { /* engine busy */ }
      }
    };
    setPhaseBoth("listening");
    armListenTimeout();
    try { rec.start(); } catch { /* a start raced a stop; next onend/onerror path recovers */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [armListenTimeout, stopListening]);

  // ---------- turns ----------
  const submit = useCallback(async (raw: string) => {
    const text = raw.trim();
    if (!text || deadRef.current || (phaseRef.current !== "listening" && phaseRef.current !== "speaking")) return;
    stopListening();
    setInterim("");
    nudgedRef.current = false;
    setLines((l) => [...l, { role: "user" as const, text }].slice(-14));
    setPhaseBoth("thinking");
    try {
      const r = await api.post<CallResponse>("/api/radio/call", { sessionId: sessionRef.current, action: "say", message: text });
      if (deadRef.current) return;
      if (r.callerName) setCallerName(r.callerName);
      setCards(r.cards);
      setLines((l) => [...l, { role: "aqua" as const, text: r.reply }].slice(-14));
      setPhaseBoth("speaking");
      await speak(r.reply);
      if (deadRef.current) return;
      if (r.endCall) return void endCallInner();
      void beginListening();
    } catch (e) {
      if (deadRef.current) return;
      setNotice((e as Error).message || "The call hit a snag.");
      void beginListening();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [beginListening, speak, stopListening]);
  submitRef.current = submit;

  const startCall = useCallback(async () => {
    if (phaseRef.current !== "off") return;
    deadRef.current = false;
    sessionRef.current = `call_${Math.random().toString(36).slice(2)}_${Date.now().toString(36)}`;
    setLines([]); setCards([]); setCallerName(null); setNotice(null); nudgedRef.current = false;
    setPhaseBoth("ringing");
    opts.emitFx("bounce");

    // Mic permission is requested here — but a denial degrades to the typed path, it doesn't block the call.
    try {
      streamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      streamRef.current = null;
      micOnRef.current = false; setMicOn(false);
      setNotice("No microphone — you can still type to Aqua below.");
    }
    if (!srCtor() && streamRef.current) {
      setNotice("This browser can't transcribe speech — type to Aqua below (Chrome/Edge work best).");
      micOnRef.current = false; setMicOn(false);
    }

    opts.suspend(); // radio pauses, queue preserved
    setPhaseBoth("greeting");
    try {
      const r = await api.post<CallResponse>("/api/radio/call", { sessionId: sessionRef.current, action: "start" });
      if (deadRef.current) return;
      setLines([{ role: "aqua", text: r.reply }]);
      setPhaseBoth("speaking");
      await speak(r.reply);
      if (!deadRef.current) void beginListening();
    } catch (e) {
      setNotice((e as Error).message || "Couldn't reach the station.");
      void beginListening();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [beginListening, opts, speak]);

  const endCallInner = useCallback(async (customBye?: string) => {
    if (phaseRef.current === "off" || phaseRef.current === "goodbye") return;
    stopListening();
    setPhaseBoth("goodbye");
    opts.emitFx("wave");
    let bye = customBye;
    if (!bye) {
      try {
        const r = await api.post<{ reply: string }>("/api/radio/call", { sessionId: sessionRef.current, action: "end" });
        bye = r.reply;
      } catch { bye = "Later! Thanks for calling Aqua FM."; }
    }
    setLines((l) => [...l, { role: "aqua" as const, text: bye! }].slice(-14));
    await speak(bye!);
    // full teardown
    deadRef.current = true;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (hasTts()) window.speechSynthesis.cancel();
    speakingRef.current = false;
    levelsRef.current.voice = 0;
    setPhaseBoth("off");
    setInterim("");
    opts.resume();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts, speak, stopListening]);

  const toggleMic = useCallback(() => {
    const next = !micOnRef.current;
    micOnRef.current = next;
    setMicOn(next);
    if (streamRef.current) streamRef.current.getAudioTracks().forEach((t) => { t.enabled = next; });
    if (!next) { stopListening(); setPhaseBoth("listening"); } // typed fallback while muted
    else if (phaseRef.current === "listening") void beginListening();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [beginListening, stopListening]);

  // teardown on unmount
  useEffect(() => () => {
    deadRef.current = true;
    stopListening();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    if (hasTts()) window.speechSynthesis.cancel();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stopListening]);

  const active = phase !== "off";
  const mascot: MascotState = phase === "ringing" ? "tuning"
    : phase === "greeting" || phase === "speaking" || phase === "goodbye" ? "talking"
    : phase === "thinking" ? "thinking"
    : "listening"; // listening + default inside a call

  const status = {
    ringing: "Calling Aqua…",
    greeting: "Aqua picked up!",
    listening: micOn ? "Aqua is listening — go ahead!" : "Type to Aqua below",
    thinking: "Aqua is thinking…",
    speaking: "Aqua is speaking",
    goodbye: "Wrapping up…",
    off: "",
  }[phase];

  return {
    active, phase, mascot, status, lines, interim, cards, callerName, notice, micOn, srAvailable, levelsRef,
    startCall, endCall: endCallInner, toggleMic, submit,
  };
}

export type Call = ReturnType<typeof useCall>;
