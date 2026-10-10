"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, ChevronDown, MapPin, Moon, Search, Sun, UserRound, Wrench, LogOut, Sparkles } from "lucide-react";
import { useSession, useUI } from "./providers";
import { Logo } from "./nav";
import { Avatar, Dropdown, DropdownContent, DropdownItem, DropdownLabel, DropdownSeparator, DropdownTrigger } from "@/components/ui/primitives";
import { fmtTime, CAMPUS_TZ } from "@/lib/time";
import { useLive } from "@/hooks/useLive";
import { cn } from "@/lib/utils";

function Clock() {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => { setNow(Date.now()); const t = setInterval(() => setNow(Date.now()), 15_000); return () => clearInterval(t); }, []);
  if (!now) return <span className="w-24 h-4 skeleton inline-block" />;
  const day = new Intl.DateTimeFormat("en-US", { timeZone: CAMPUS_TZ, weekday: "short", month: "short", day: "numeric" }).format(now);
  return <span className="tabular-nums text-sm text-fg-muted whitespace-nowrap" title="Campus time (America/New_York)"><span className="hidden lg:inline">{day} · </span>{fmtTime(now)}</span>;
}

export function TopBar({ overlay = false, className }: { overlay?: boolean; className?: string }) {
  const { user, unread, demoMode, switchDemoUser } = useSession();
  const { theme, setTheme, openAssistant } = useUI();
  const router = useRouter();
  const [q, setQ] = useState("");
  const demo = useLive<{ users: { id: string; displayName: string; avatar: string }[] }>(demoMode ? "/api/demo" : null, { interval: 60_000 });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!q.trim()) return;
    if (/\?$|^(what|any|who|is|are|where|when|find|show)\b/i.test(q.trim())) openAssistant(q.trim());
    else router.push(`/discover?q=${encodeURIComponent(q.trim())}`);
    setQ("");
  };

  return (
    <header className={cn("z-30 flex items-center gap-2 sm:gap-3 px-3 sm:px-4 h-14", overlay ? "absolute top-0 left-0 right-0 md:left-[72px]" : "sticky top-0 border-b border-border bg-bg-elev/80 backdrop-blur-xl md:ml-[72px]", className)}>
      <div className={cn("md:hidden", overlay && "glass rounded-2xl px-2 py-1")}><Logo compact /></div>
      <div className={cn("hidden md:flex items-center gap-2 rounded-xl px-2.5 h-9 text-sm font-medium", overlay ? "glass-strong" : "bg-fg/5")} title="Campus">
        <MapPin className="size-4 text-carolina" /> UNC-Chapel Hill <ChevronDown className="size-3.5 text-fg-faint" />
      </div>
      <form onSubmit={submit} role="search" className={cn("flex-1 min-w-0 max-w-xl flex items-center gap-2 rounded-xl h-10 px-3", overlay ? "glass-strong" : "bg-fg/5 border border-transparent focus-within:border-border-strong")}>
        <Search className="size-4 text-fg-faint shrink-0" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search campus, or ask a question…" aria-label="Search" className="flex-1 bg-transparent outline-none text-sm placeholder:text-fg-faint min-w-0" />
        <button type="button" onClick={() => openAssistant(q || undefined)} className="hidden sm:inline-flex items-center gap-1 rounded-lg px-2 h-7 text-xs text-carolina hover:bg-carolina-soft/60" aria-label="Ask a question"><Sparkles className="size-3.5" /> Ask</button>
      </form>
      <div className="hidden sm:block"><Clock /></div>
      <button type="button" onClick={() => setTheme(theme === "dark" ? "light" : "dark")} aria-label="Toggle theme" className={cn("grid size-10 place-items-center rounded-xl text-fg-muted hover:text-fg", overlay ? "glass-strong" : "hover:bg-fg/5")}>
        {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
      </button>
      <Link href="/notifications" aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`} className={cn("relative grid size-10 place-items-center rounded-xl text-fg-muted hover:text-fg", overlay ? "glass-strong" : "hover:bg-fg/5")}>
        <Bell className="size-4" />
        {unread > 0 && <span className="absolute right-1.5 top-1.5 min-w-4 h-4 px-1 rounded-full bg-red text-white text-[10px] font-bold grid place-items-center">{unread > 9 ? "9+" : unread}</span>}
      </Link>
      <Dropdown>
        <DropdownTrigger asChild>
          <button type="button" aria-label="Account menu" className={cn("flex items-center gap-2 rounded-xl pl-1 pr-2 h-10", overlay ? "glass-strong" : "hover:bg-fg/5")}>
            <Avatar emoji={user?.avatar} name={user?.displayName} size={30} />
            <span className="hidden lg:block text-sm font-medium max-w-[120px] truncate">{user?.displayName ?? "Guest"}</span>
            <ChevronDown className="size-3.5 text-fg-faint" />
          </button>
        </DropdownTrigger>
        <DropdownContent>
          <DropdownLabel>{user ? `Signed in as ${user.displayName}` : "Browsing as a guest"}</DropdownLabel>
          <DropdownItem asChild><Link href="/profile"><UserRound className="size-4" /> Profile & settings</Link></DropdownItem>
          {demoMode && (
            <>
              <DropdownSeparator />
              <DropdownLabel>Demo profiles</DropdownLabel>
              {(demo.data?.users ?? []).map((u) => (
                <DropdownItem key={u.id} onSelect={() => void switchDemoUser(u.id)} className={cn(user?.id === u.id && "bg-carolina-soft/60")}>
                  <span className="text-base leading-none">{u.avatar}</span> {u.displayName}
                </DropdownItem>
              ))}
              {user && <DropdownItem onSelect={() => void switchDemoUser(null)}><LogOut className="size-4" /> Sign out</DropdownItem>}
              <DropdownSeparator />
              <DropdownItem asChild><Link href="/developer"><Wrench className="size-4" /> Demo & integrations</Link></DropdownItem>
            </>
          )}
        </DropdownContent>
      </Dropdown>
    </header>
  );
}
