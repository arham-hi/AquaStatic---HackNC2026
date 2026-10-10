/** Three faint Aero bubbles. Purely decorative; motion stops under prefers-reduced-motion (see globals.css). */
export function Bubbles({ className = "" }: { className?: string }) {
  return (
    <div aria-hidden className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`}>
      <span className="bubble" style={{ width: 120, height: 120, right: "12%", top: "6%", animationDelay: "0s" }} />
      <span className="bubble" style={{ width: 56, height: 56, right: "22%", top: "40%", animationDelay: "-3s" }} />
      <span className="bubble" style={{ width: 34, height: 34, right: "8%", top: "58%", animationDelay: "-6s" }} />
    </div>
  );
}
