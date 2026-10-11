"use client";
// Accessible 2D Aqua — used while WebGL loads, when it's unavailable, or if the canvas errors.
// Still animated: gentle bob, blinking eyes, grille bars that pulse while Aqua talks.

import type { MascotState } from "../use-station";
import { cn } from "@/lib/utils";

export function MascotFallback({ state, voiceLevel = 0, className }: { state: MascotState; voiceLevel?: number; className?: string }) {
  const talking = state === "talking" || state === "alert";
  const led = { idle: "#46c8ff", tuning: "#ffffff", music: "#3ee6c4", talking: "#ff5a5a", alert: "#ffb02e", muted: "#8a99a6" }[state];
  return (
    <div className={cn("grid place-items-center", className)} data-state={state} role="img" aria-label={`Aqua, the Aqua FM mascot — ${state}`}>
      <svg viewBox="0 0 260 240" className="aqua-svg h-full max-h-[320px] w-auto drop-shadow-[0_18px_30px_rgba(20,110,170,0.35)]" aria-hidden>
        <defs>
          <linearGradient id="aqua-shell" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#67d1f5" /><stop offset="55%" stopColor="#34b6e6" /><stop offset="100%" stopColor="#1f9fd6" />
          </linearGradient>
          <linearGradient id="aqua-plate" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#e9f9ff" /><stop offset="100%" stopColor="#b3e3f8" />
          </linearGradient>
          <linearGradient id="aqua-gloss" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(255,255,255,0.85)" /><stop offset="100%" stopColor="rgba(255,255,255,0)" />
          </linearGradient>
        </defs>

        <g className="aqua-bob">
          {/* antenna */}
          <g className="aqua-antenna" style={{ transformOrigin: "208px 56px" }}>
            <rect x="205" y="18" width="5" height="42" rx="2.5" fill="#d9edf7" transform="rotate(16 208 56)" />
            <circle cx="218" cy="20" r="7" fill="#7fdcff" />
          </g>
          {/* arms */}
          <ellipse cx="36" cy="140" rx="11" ry="20" fill="#2aa9dd" transform="rotate(-18 36 140)" />
          <ellipse cx="224" cy="140" rx="11" ry="20" fill="#2aa9dd" transform="rotate(18 224 140)" />
          {/* feet */}
          <ellipse cx="96" cy="214" rx="20" ry="10" fill="#1f9fd6" />
          <ellipse cx="164" cy="214" rx="20" ry="10" fill="#1f9fd6" />

          {/* body */}
          <rect x="46" y="52" width="168" height="150" rx="34" fill="url(#aqua-shell)" />
          <rect x="46" y="52" width="168" height="150" rx="34" fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth="2" />
          <ellipse cx="130" cy="62" rx="76" ry="14" fill="url(#aqua-gloss)" opacity="0.8" />
          <rect x="62" y="70" width="136" height="120" rx="20" fill="url(#aqua-plate)" />

          {/* display */}
          <rect x="92" y="78" width="76" height="18" rx="7" fill={state === "idle" ? "#0d3a5c" : "#7d1f2d"} />
          <text x="130" y="91" textAnchor="middle" fontSize="11" fontWeight="700" fill={state === "idle" ? "#bff0ff" : "#ffd9d9"} fontFamily="system-ui">
            {state === "idle" ? "AQUA FM" : "● ON AIR"}
          </text>
          {/* LED */}
          <circle cx="76" cy="87" r="4.5" fill={led} className={state === "talking" ? "aqua-led-blink" : undefined} />

          {/* eyes */}
          {[100, 160].map((cx) => (
            <g key={cx} className="aqua-eye" style={{ transformOrigin: `${cx}px 122px` }}>
              <ellipse cx={cx} cy="122" rx="16" ry="17" fill="#fff" />
              <circle cx={cx} cy="124" r="8.5" fill="#1170aa" />
              <circle cx={cx} cy="124" r="4.5" fill="#081c2c" />
              <circle cx={cx + 3.5} cy="119" r="2.6" fill="#fff" />
            </g>
          ))}
          {/* cheeks */}
          <ellipse cx="76" cy="140" rx="9" ry="5.5" fill="#ff9fb7" opacity={talking ? 0.8 : 0.45} />
          <ellipse cx="184" cy="140" rx="9" ry="5.5" fill="#ff9fb7" opacity={talking ? 0.8 : 0.45} />

          {/* mouth */}
          {talking ? (
            <ellipse cx="130" cy="152" rx="11" ry={4 + voiceLevel * 9} fill="#5b2340" className="aqua-mouth" />
          ) : (
            <path d="M118 148 q12 12 24 0" stroke="#0a2c42" strokeWidth="4" fill="none" strokeLinecap="round" />
          )}

          {/* speaker grille */}
          <rect x="84" y="168" width="92" height="16" rx="8" fill="#0e3a55" />
          {Array.from({ length: 7 }, (_, i) => (
            <rect key={i} x={92 + i * 11} y={talking ? 173 - voiceLevel * 5 : 172} width="5.5" height={talking ? 6 + voiceLevel * 8 : 8} rx="2.75" fill="#9ee2fb" className={talking ? "aqua-grille-bar" : undefined} style={{ animationDelay: `${i * 90}ms` }} />
          ))}

          {/* knobs */}
          <rect x="84" y="42" width="20" height="12" rx="5" fill="#e8f7ff" />
          <rect x="156" y="42" width="20" height="12" rx="5" fill="#e8f7ff" />
        </g>
      </svg>
      <style jsx>{`
        .aqua-bob { animation: aqua-bob 3.2s ease-in-out infinite; transform-origin: 130px 130px; }
        @keyframes aqua-bob { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-5px) } }
        .aqua-antenna { animation: aqua-sway 4s ease-in-out infinite; }
        @keyframes aqua-sway { 0%,100% { transform: rotate(0deg) } 50% { transform: rotate(3deg) } }
        .aqua-eye { animation: aqua-blink 4.2s ease-in-out infinite; }
        @keyframes aqua-blink { 0%, 92%, 100% { transform: scaleY(1) } 95% { transform: scaleY(0.08) } }
        .aqua-grille-bar { animation: aqua-bar 0.5s ease-in-out infinite alternate; }
        @keyframes aqua-bar { from { transform: scaleY(0.6) } to { transform: scaleY(1.15) } }
        .aqua-led-blink { animation: aqua-led 0.9s ease-in-out infinite alternate; }
        @keyframes aqua-led { from { opacity: 0.5 } to { opacity: 1 } }
        .aqua-mouth { transition: ry 90ms linear; }
        @media (prefers-reduced-motion: reduce) { .aqua-bob, .aqua-antenna, .aqua-eye, .aqua-grille-bar, .aqua-led-blink { animation: none } }
      `}</style>
    </div>
  );
}
