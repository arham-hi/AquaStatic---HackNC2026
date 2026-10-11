"use client";
// Community success celebration. Only ever rendered after the backend confirms a match
// reached "completed" — never on a guess, a click, or a retry. Copy stays honest: reuse
// categories get resource-sharing language, everything else gets "helped" language.

import { useEffect, useMemo } from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { Check, Leaf, Map as MapIcon, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { REUSE_CATEGORIES } from "@/lib/categories";
import type { MatchView } from "@/lib/services/connections";

/** Gentle two-phrase chime via Web Audio — no audio files needed, safe when audio is unavailable. */
export function playSuccessChime() {
  try {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    for (const [i, f] of [523.25, 659.25, 783.99].entries()) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = f;
      const t = ctx.currentTime + i * 0.09;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.12, t + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.65);
    }
    window.setTimeout(() => void ctx.close().catch(() => {}), 2000);
  } catch { /* audio unavailable */ }
}

type Particle = { id: number; x: number; y: number; size: number; delay: number; color: string };

export function Celebration({ match, onClose }: { match: MatchView; onClose: () => void }) {
  const reduced = useReducedMotion();
  const isReuse = (REUSE_CATEGORIES as readonly string[]).includes(match.request.category);

  const particles = useMemo<Particle[]>(() => Array.from({ length: 26 }, (_, i) => {
    const angle = (i / 26) * Math.PI * 2 + Math.random() * 0.35;
    const dist = 90 + Math.random() * 140;
    return {
      id: i,
      x: Math.cos(angle) * dist,
      y: Math.sin(angle) * dist - 40,
      size: 6 + Math.random() * 11,
      delay: Math.random() * 0.18,
      color: i % 3 === 0 ? "#22d3ee" : i % 3 === 1 ? "#2fbf8f" : "#7dd3fc",
    };
  }), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div role="dialog" aria-modal="true" aria-label="Connection completed" className="fixed inset-0 z-[110] grid place-items-center bg-[rgba(5,12,28,0.45)] p-4 backdrop-blur-sm">
      <motion.div initial={reduced ? false : { opacity: 0, scale: 0.92, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ type: "spring", stiffness: 300, damping: 24 }}
        className="glass-strong relative w-full max-w-sm overflow-visible rounded-3xl p-6 text-center shadow-2xl">
        {/* Mint/cyan bubble burst around the check. */}
        {!reduced && (
          <div aria-hidden className="pointer-events-none absolute left-1/2 top-16">
            {particles.map((p) => (
              <motion.span key={p.id}
                initial={{ x: 0, y: 0, scale: 0, opacity: 0.95 }}
                animate={{ x: p.x, y: p.y, scale: 1, opacity: 0 }}
                transition={{ duration: 1.15, delay: p.delay, ease: "easeOut" }}
                className="absolute rounded-full"
                style={{ width: p.size, height: p.size, background: `radial-gradient(circle at 32% 28%, rgba(255,255,255,.9), ${p.color})`, boxShadow: `0 0 10px ${p.color}` }}
              />
            ))}
          </div>
        )}

        <button type="button" onClick={onClose} aria-label="Close" className="absolute right-3 top-3 rounded-lg p-1.5 text-fg-muted hover:bg-fg/5 hover:text-fg">
          <X className="size-4" />
        </button>

        <motion.div initial={reduced ? false : { scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 350, damping: 16, delay: 0.08 }}
          className="relative mx-auto grid size-16 place-items-center rounded-full bg-gradient-to-br from-[#5eead4] to-mint text-white shadow-[0_10px_30px_-8px_rgba(47,191,143,.7)]">
          {!reduced && <span aria-hidden className="absolute inset-0 rounded-full border-2 border-mint" style={{ animation: "pulse-ring 1.4s ease-out 2" }} />}
          <Check className="size-8" strokeWidth={3} aria-hidden />
        </motion.div>

        <h2 className="mt-4 text-xl font-semibold tracking-tight">Another connection made!</h2>
        <p className="mt-1.5 text-sm leading-relaxed text-fg-muted">
          {isReuse
            ? "One more resource shared across campus — thanks for keeping useful things in circulation."
            : "One more student helped! Thanks for showing up for a fellow Tar Heel."}
        </p>
        <p className="mt-2 line-clamp-2 text-xs text-fg-faint">&ldquo;{match.request.title}&rdquo; ↔ &ldquo;{match.offer.title}&rdquo;</p>

        <div className="mt-5 flex flex-col gap-2">
          <Button variant="mint" asChild>
            <Link href="/impact"><Leaf /> View AquaImpact</Link>
          </Button>
          <Button variant="secondary" asChild>
            <Link href="/"><MapIcon /> Back to campus</Link>
          </Button>
        </div>
      </motion.div>
    </div>
  );
}
