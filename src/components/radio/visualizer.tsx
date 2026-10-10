"use client";
// Bars from a real AnalyserNode (MP3) or, for browser speech, from word-boundary kicks while actually speaking.
// Idle/paused = flat. Decorative only: the transcript is the text alternative.

import { useEffect, useRef, type MutableRefObject } from "react";
import { cn } from "@/lib/utils";

const BARS = 56;

export function Visualizer({ analyser, active, kickRef, className }: { analyser: AnalyserNode | null; active: boolean; kickRef: MutableRefObject<number>; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const c = canvas?.getContext("2d");
    if (!canvas || !c) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const levels = new Float32Array(BARS);
    const data = analyser ? new Uint8Array(analyser.frequencyBinCount) : null;
    let raf = 0, lastKick = kickRef.current, energy = 0;
    const bell = (i: number) => 0.45 + 0.55 * Math.sin((Math.PI * (i + 0.5)) / BARS);

    const draw = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.clientWidth, h = canvas.clientHeight;
      if (canvas.width !== w * dpr || canvas.height !== h * dpr) { canvas.width = w * dpr; canvas.height = h * dpr; }
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      c.clearRect(0, 0, w, h);

      if (active && data && analyser) {
        analyser.getByteFrequencyData(data);
        const usable = Math.floor(data.length * 0.75); // top bins are mostly silence for speech
        for (let i = 0; i < BARS; i++) levels[i] = (data[Math.floor((i / BARS) * usable)] / 255) * bell(i);
      } else if (active && reduced) {
        levels.fill(0.35);
      } else if (active) {
        if (kickRef.current !== lastKick) { lastKick = kickRef.current; energy = 1; }
        energy = Math.max(0.3, energy * 0.95);
        for (let i = 0; i < BARS; i++) levels[i] += (energy * (0.3 + 0.7 * Math.random()) * bell(i) - levels[i]) * 0.28;
      } else {
        for (let i = 0; i < BARS; i++) levels[i] *= 0.78;
      }

      const gap = 3, bw = Math.max(1.5, (w - gap * (BARS - 1)) / BARS);
      c.fillStyle = getComputedStyle(canvas).color;
      for (let i = 0; i < BARS; i++) {
        const bh = Math.max(3, levels[i] * h);
        const x = i * (bw + gap), y = (h - bh) / 2;
        c.globalAlpha = 0.35 + 0.65 * levels[i];
        c.beginPath();
        c.roundRect(x, y, bw, bh, bw / 2);
        c.fill();
      }
      c.globalAlpha = 1;
      const settling = !active && levels.some((l) => l > 0.01);
      if ((active && !reduced) || settling) raf = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, [analyser, active, kickRef]);

  return <canvas ref={ref} aria-hidden className={cn("block w-full h-16 text-carolina", className)} />;
}
