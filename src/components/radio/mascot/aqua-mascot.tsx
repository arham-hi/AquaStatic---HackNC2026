"use client";
// Aqua on the page: loads the 3D scene client-side, tracks the cursor, handles hover/tap,
// shows a speech bubble, and falls back to the animated 2D SVG when WebGL can't run.

import dynamic from "next/dynamic";
import { Component, useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject, type ReactNode } from "react";
import type { MascotFx, MascotState, StationLevels } from "../use-station";
import { CLICK_PHRASES, type AquaAnim } from "./aqua-expressions";
import { MascotFallback } from "./mascot-fallback";

const AquaScene = dynamic(() => import("./aqua-scene"), { ssr: false, loading: () => null });

class SceneBoundary extends Component<{ children: ReactNode; onError: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { this.props.onError(); }
  render() { return this.state.failed ? null : this.props.children; }
}

const webglOk = () => {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") ?? c.getContext("webgl"));
  } catch {
    return false;
  }
};

const FX_CYCLE: NonNullable<MascotFx>["name"][] = ["wave", "bounce", "celebrate"];

export function AquaMascot({
  state, levels, fx, className,
}: {
  state: MascotState;
  levels: MutableRefObject<StationLevels>;
  fx: MutableRefObject<MascotFx>;
  className?: string;
}) {
  const [webgl, setWebgl] = useState<boolean | null>(null);
  const [phrase, setPhrase] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const fxPick = useRef(0);
  const phraseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [fallbackVoice, setFallbackVoice] = useState(0);

  const pointer = useRef({ x: 0, y: 0, active: false });
  const hover = useRef(false);
  const anim = useMemo<AquaAnim>(
    () => ({ state, levels, fx, pointer, hover, reduced: false }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refs are stable; state syncs below
    [],
  );
  anim.state = state;

  useEffect(() => {
    anim.reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setWebgl(webglOk());
  }, [anim]);

  // Cursor tracking — fine pointers only, disabled on touch.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el || !window.matchMedia("(pointer: fine)").matches) return;
    const move = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      pointer.current.x = Math.max(-1, Math.min(1, (e.clientX - cx) / (r.width * 0.75)));
      pointer.current.y = Math.max(-1, Math.min(1, (e.clientY - cy) / (r.height * 0.75)));
      pointer.current.active = true;
    };
    const leave = () => { pointer.current.active = false; };
    window.addEventListener("pointermove", move, { passive: true });
    document.documentElement.addEventListener("pointerleave", leave);
    return () => { window.removeEventListener("pointermove", move); document.documentElement.removeEventListener("pointerleave", leave); };
  }, []);

  // Fallback SVG gets a throttled voice level for its mouth.
  useEffect(() => {
    if (webgl !== false) return;
    const t = setInterval(() => setFallbackVoice(levels.current.voice), 90);
    return () => clearInterval(t);
  }, [webgl, levels]);

  const onEnter = useCallback(() => { hover.current = true; }, []);
  const onLeave = useCallback(() => { hover.current = false; }, []);
  const onTap = useCallback(() => {
    const name = FX_CYCLE[fxPick.current++ % FX_CYCLE.length];
    fx.current = { name, t0: performance.now() };
    const phraseIdx = (fxPick.current * 7 + 1) % CLICK_PHRASES.length;
    setPhrase(CLICK_PHRASES[phraseIdx]);
    if (phraseTimer.current) clearTimeout(phraseTimer.current);
    phraseTimer.current = setTimeout(() => setPhrase(null), 2600);
  }, [fx]);

  return (
    <div
      ref={wrapRef}
      className={className}
      data-mascot-state={state}
      onPointerEnter={onEnter}
      onPointerLeave={onLeave}
      onClick={onTap}
      role="button"
      tabIndex={0}
      aria-label={`Aqua, the Aqua FM host — ${state}. Tap for a wave.`}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onTap(); } }}
      style={{ cursor: "pointer" }}
    >
      {phrase && (
        <div className="pointer-events-none absolute left-1/2 top-2 z-10 -translate-x-1/2 animate-pop">
          <div className="glass-strong rounded-2xl rounded-bl-sm px-3.5 py-2 text-sm font-semibold whitespace-nowrap text-carolina-deep shadow-md">
            {phrase}
          </div>
        </div>
      )}
      {webgl === false ? (
        <MascotFallback state={state} voiceLevel={fallbackVoice} className="h-full w-full" />
      ) : webgl === true ? (
        <SceneBoundary onError={() => setWebgl(false)}>
          <AquaScene anim={anim} />
        </SceneBoundary>
      ) : (
        <MascotFallback state={state} className="h-full w-full opacity-80" />
      )}
    </div>
  );
}
