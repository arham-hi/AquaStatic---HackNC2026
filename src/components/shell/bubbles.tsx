"use client";
// Faint Aero bubbles. Decorative only; motion stops under prefers-reduced-motion (see globals.css).

import { usePathname } from "next/navigation";

type Spec = { size: number; left: string; top: string; delay: string };

const SETS: Spec[][] = [
  [{ size: 140, left: "78%", top: "8%", delay: "0s" }, { size: 60, left: "88%", top: "34%", delay: "-3s" }, { size: 36, left: "70%", top: "26%", delay: "-5s" }, { size: 90, left: "6%", top: "62%", delay: "-2s" }, { size: 44, left: "16%", top: "84%", delay: "-7s" }, { size: 28, left: "92%", top: "72%", delay: "-4s" }],
  [{ size: 110, left: "84%", top: "14%", delay: "-1s" }, { size: 48, left: "74%", top: "6%", delay: "-6s" }, { size: 150, left: "4%", top: "44%", delay: "-3s" }, { size: 40, left: "18%", top: "30%", delay: "-8s" }, { size: 64, left: "90%", top: "60%", delay: "-2s" }, { size: 30, left: "60%", top: "88%", delay: "-5s" }],
  [{ size: 96, left: "10%", top: "12%", delay: "-2s" }, { size: 32, left: "22%", top: "6%", delay: "-4s" }, { size: 130, left: "86%", top: "40%", delay: "0s" }, { size: 56, left: "76%", top: "66%", delay: "-6s" }, { size: 40, left: "8%", top: "80%", delay: "-3s" }, { size: 70, left: "50%", top: "92%", delay: "-7s" }],
];

/** Fixed, full-viewport bubbles behind page content. The set changes with the route so pages feel different. */
export function PageBubbles() {
  const path = usePathname();
  let h = 0;
  for (const c of path) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const set = SETS[h % SETS.length];
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-0 overflow-hidden md:left-[72px]">
      {set.map((b, i) => <span key={i} className="bubble" style={{ width: b.size, height: b.size, left: b.left, top: b.top, animationDelay: b.delay }} />)}
    </div>
  );
}

/** Three bubbles for the map corner (absolute within its parent). */
export function Bubbles({ className = "" }: { className?: string }) {
  return (
    <div aria-hidden className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`}>
      <span className="bubble" style={{ width: 120, height: 120, right: "12%", top: "6%", animationDelay: "0s" }} />
      <span className="bubble" style={{ width: 56, height: 56, right: "22%", top: "40%", animationDelay: "-3s" }} />
      <span className="bubble" style={{ width: 34, height: 34, right: "8%", top: "58%", animationDelay: "-6s" }} />
    </div>
  );
}
