"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { MapPin, X } from "lucide-react";
import { LOCATIONS, searchLocations, getLocation } from "@/lib/locations";
import { Input } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";

/** Autocomplete over the campus registry. Value is a location id or null. */
export function LocationPicker({ value, onChange, placeholder = "Search a campus place…", autoFocus, className }: { value: string | null; onChange: (id: string | null) => void; placeholder?: string; autoFocus?: boolean; className?: string }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [idx, setIdx] = useState(0);
  const wrap = useRef<HTMLDivElement>(null);
  const selected = getLocation(value);
  const results = useMemo(() => (q ? searchLocations(q, 8) : LOCATIONS.slice(0, 8)), [q]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  if (selected) {
    return (
      <div className={cn("flex items-center gap-2 h-10 rounded-xl border border-carolina/50 bg-carolina-soft/40 px-3 text-sm", className)}>
        <MapPin className="size-4 text-carolina shrink-0" />
        <span className="flex-1 truncate font-medium">{selected.name}</span>
        <button type="button" onClick={() => { onChange(null); setQ(""); setOpen(true); }} aria-label="Change location" className="rounded-md p-1 text-fg-muted hover:bg-fg/10"><X className="size-3.5" /></button>
      </div>
    );
  }
  return (
    <div ref={wrap} className={cn("relative", className)}>
      <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-fg-faint pointer-events-none" />
      <Input value={q} autoFocus={autoFocus} onChange={(e) => { setQ(e.target.value); setOpen(true); setIdx(0); }} onFocus={() => setOpen(true)} placeholder={placeholder} className="pl-9" aria-autocomplete="list" aria-expanded={open}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") { e.preventDefault(); setIdx((i) => Math.min(results.length - 1, i + 1)); }
          if (e.key === "ArrowUp") { e.preventDefault(); setIdx((i) => Math.max(0, i - 1)); }
          if (e.key === "Enter" && results[idx]) { e.preventDefault(); onChange(results[idx].id); setOpen(false); }
          if (e.key === "Escape") setOpen(false);
        }} />
      {open && results.length > 0 && (
        <ul role="listbox" className="absolute z-50 mt-1.5 w-full max-h-64 overflow-auto scrollbar-thin rounded-xl glass-strong p-1 animate-rise">
          {results.map((l, i) => (
            <li key={l.id} role="option" aria-selected={i === idx}>
              <button type="button" onMouseEnter={() => setIdx(i)} onClick={() => { onChange(l.id); setOpen(false); }} className={cn("w-full text-left flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm", i === idx && "bg-carolina-soft/60")}>
                <span className="size-6 grid place-items-center rounded-md bg-fg/5 text-fg-muted text-[10px] uppercase font-bold">{l.category[0]}</span>
                <span className="flex-1 truncate">{l.name}</span>
                {l.aliases[0] && <span className="text-[11px] text-fg-faint">“{l.aliases[0]}”</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
