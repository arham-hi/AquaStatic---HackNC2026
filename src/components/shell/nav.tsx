"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Map as MapIcon, Compass, HeartHandshake, Radio, Bus, MessageSquare, Bell, UserRound, Wrench, Plus, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSession, useUI } from "./providers";
import { Tip } from "@/components/ui/primitives";

export const NAV = [
  { href: "/", label: "Live map", icon: MapIcon },
  { href: "/discover", label: "Discover", icon: Compass },
  { href: "/connect", label: "Connect", icon: HeartHandshake },
  { href: "/radio", label: "Radio", icon: Radio },
  { href: "/transit", label: "Transit", icon: Bus },
  { href: "/messages", label: "Messages", icon: MessageSquare },
  { href: "/notifications", label: "Notifications", icon: Bell },
  { href: "/profile", label: "Profile", icon: UserRound },
] as const;

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/" className="flex items-center gap-2.5 group" aria-label="Aqua Static home">
      <span className="relative grid size-9 place-items-center rounded-xl bg-gradient-to-br from-carolina to-[#2e7fb8] text-white shadow-[0_8px_20px_-8px_rgba(75,156,211,0.9)]">
        <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M3 13c2.5 0 2.5-3 5-3s2.5 3 5 3 2.5-3 5-3 2.5 3 5 3" />
          <path d="M3 18c2.5 0 2.5-3 5-3s2.5 3 5 3 2.5-3 5-3 2.5 3 5 3" opacity=".55" />
          <circle cx="12" cy="6" r="1.6" fill="currentColor" stroke="none" />
        </svg>
        <span className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-mint ring-2 ring-bg" />
      </span>
      {!compact && (
        <span className="leading-none">
          <span className="block text-[15px] font-semibold tracking-tight">Aqua Static</span>
          <span className="block text-[10px] uppercase tracking-[0.14em] text-fg-faint mt-1">Your campus. In real time.</span>
        </span>
      )}
    </Link>
  );
}

export function NavRail() {
  const path = usePathname();
  const { unread, demoMode } = useSession();
  const items = demoMode ? [...NAV, { href: "/developer", label: "Demo & integrations", icon: Wrench }] : NAV;
  return (
    <nav aria-label="Primary" className="hidden md:flex fixed left-0 top-0 bottom-0 z-40 w-[72px] flex-col items-center gap-1 border-r border-border bg-bg-elev/80 backdrop-blur-xl py-3">
      <div className="mb-3"><Logo compact /></div>
      {items.map(({ href, label, icon: Icon }) => {
        const active = href === "/" ? path === "/" : path.startsWith(href);
        return (
          <Tip key={href} label={label}>
            <Link href={href} aria-label={label} aria-current={active ? "page" : undefined}
              className={cn("relative grid size-11 place-items-center rounded-xl text-fg-muted transition-colors hover:bg-fg/5 hover:text-fg", active && "bg-carolina-soft text-carolina")}>
              <Icon className="size-5" />
              {href === "/notifications" && unread > 0 && <span className="absolute right-1.5 top-1.5 min-w-4 h-4 px-1 rounded-full bg-red text-white text-[10px] font-bold grid place-items-center">{unread > 9 ? "9+" : unread}</span>}
            </Link>
          </Tip>
        );
      })}
      <div className="mt-auto text-[9px] text-fg-faint rotate-180 [writing-mode:vertical-rl] tracking-widest select-none">HACKNC 2026</div>
    </nav>
  );
}

export function BottomNav() {
  const path = usePathname();
  const { openCreate } = useUI();
  const items = [NAV[0], NAV[1], null, NAV[2], NAV[3]] as const;
  return (
    <nav aria-label="Primary" className="md:hidden fixed bottom-0 inset-x-0 z-40 border-t border-border bg-bg-elev/90 backdrop-blur-xl pb-[env(safe-area-inset-bottom)]">
      <div className="grid grid-cols-5 h-16">
        {items.map((it, i) => it ? (
          <Link key={it.href} href={it.href} aria-label={it.label} className={cn("relative flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium text-fg-muted", (it.href === "/" ? path === "/" : path.startsWith(it.href)) && "text-carolina")}>
            <it.icon className="size-5" />{it.label}
          </Link>
        ) : (
          <button key={i} type="button" onClick={() => openCreate()} aria-label="Create a post" className="flex items-center justify-center">
            <span className="grid size-12 -mt-6 place-items-center rounded-2xl bg-carolina text-white shadow-lg"><Plus className="size-6" /></span>
          </button>
        ))}
      </div>
    </nav>
  );
}

export function Fab() {
  const { openCreate, openAssistant } = useUI();
  return (
    <div className="hidden md:flex fixed bottom-6 right-6 z-40 flex-col items-end gap-2.5">
      <button type="button" onClick={() => openAssistant()} aria-label="Ask Aqua Static" className="group flex items-center gap-2 rounded-full glass-strong pl-3 pr-4 h-11 text-sm font-medium hover:bg-carolina-soft/60 transition-colors">
        <Sparkles className="size-4 text-carolina" /> Ask Aqua Static
      </button>
      <button type="button" onClick={() => openCreate()} aria-label="Create a post" className="grid size-14 place-items-center rounded-2xl bg-carolina text-white shadow-[0_14px_30px_-10px_rgba(75,156,211,0.95)] hover:brightness-110 active:scale-95 transition-all">
        <Plus className="size-7" />
      </button>
    </div>
  );
}
