"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Map as MapIcon, Radio, HeartHandshake, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { useUI } from "./providers";
import { Tip } from "@/components/ui/primitives";

export const NAV = [
  { href: "/", label: "Live Map", icon: MapIcon },
  { href: "/radio", label: "Radio", icon: Radio },
  { href: "/connect", label: "Connect", icon: HeartHandshake },
] as const;

const isActive = (path: string, href: string) => (href === "/" ? path === "/" : path.startsWith(href));

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/" className="flex items-center gap-2.5" aria-label="Aqua Static home">
      <span className="aero-logo grid size-9 place-items-center rounded-2xl bg-gradient-to-br from-carolina to-[#2e7fb8] text-white shadow-[0_8px_20px_-8px_rgba(75,156,211,0.9)]">
        <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M3 13c2.5 0 2.5-3 5-3s2.5 3 5 3 2.5-3 5-3 2.5 3 5 3" />
          <path d="M3 18c2.5 0 2.5-3 5-3s2.5 3 5 3 2.5-3 5-3 2.5 3 5 3" opacity=".55" />
          <circle cx="12" cy="6" r="1.6" fill="currentColor" stroke="none" />
        </svg>
      </span>
      {!compact && <span className="text-[15px] font-semibold tracking-tight">Aqua Static</span>}
    </Link>
  );
}

/** Desktop: slim left rail with three destinations. */
export function NavRail() {
  const path = usePathname();
  return (
    <nav aria-label="Primary" className="aero-rail hidden md:flex fixed left-0 top-0 bottom-0 z-40 w-[72px] flex-col items-center gap-2 border-r border-border bg-bg-elev/80 backdrop-blur-xl py-4">
      <div className="mb-4"><Logo compact /></div>
      {NAV.map(({ href, label, icon: Icon }) => (
        <Tip key={href} label={label}>
          <Link href={href} aria-label={label} aria-current={isActive(path, href) ? "page" : undefined}
            className={cn("aero-nav-link grid size-11 place-items-center rounded-2xl text-fg-muted transition-colors hover:bg-fg/5 hover:text-fg", isActive(path, href) && "bg-carolina-soft text-carolina")}>
            <Icon className="size-5" />
          </Link>
        </Tip>
      ))}
    </nav>
  );
}

/** Phone: three destinations and a post button. */
export function BottomNav() {
  const path = usePathname();
  const { openCreate } = useUI();
  const items = [NAV[0], NAV[1], NAV[2], null] as const;
  return (
    <nav aria-label="Primary" className="aero-bottom-nav md:hidden fixed bottom-0 inset-x-0 z-40 border-t border-border bg-bg-elev/90 backdrop-blur-xl pb-[env(safe-area-inset-bottom)]">
      <div className="grid grid-cols-4 h-16">
        {items.map((it, i) => it ? (
          <Link key={it.href} href={it.href} aria-label={it.label} aria-current={isActive(path, it.href) ? "page" : undefined}
            className={cn("flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium text-fg-muted", isActive(path, it.href) && "text-carolina")}>
            <it.icon className="size-5" />{it.label}
          </Link>
        ) : (
          <button key={i} type="button" onClick={() => openCreate()} aria-label="Create a post" className="flex items-center justify-center">
            <span className="grid size-12 -mt-6 place-items-center rounded-2xl btn-aero text-white"><Plus className="size-6" /></span>
          </button>
        ))}
      </div>
    </nav>
  );
}

/** Desktop: one floating post button. Asking lives in the search box. */
export function Fab() {
  const { openCreate } = useUI();
  return (
    <button type="button" onClick={() => openCreate()} aria-label="Create a post"
      className="hidden md:grid fixed bottom-6 right-6 z-40 size-14 place-items-center rounded-full btn-aero text-white active:scale-95 transition-all">
      <Plus className="size-7" />
    </button>
  );
}
