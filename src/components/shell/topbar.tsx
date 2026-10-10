"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, Moon, Search, Sun, UserRound, Wrench, LogOut, Sparkles, CheckCheck } from "lucide-react";
import { toast } from "sonner";
import { useSession, useUI } from "./providers";
import { Logo } from "./nav";
import { Avatar, Dropdown, DropdownContent, DropdownItem, DropdownLabel, DropdownSeparator, DropdownTrigger } from "@/components/ui/primitives";
import { useLive } from "@/hooks/useLive";
import { api } from "@/lib/client";
import { timeAgo } from "@/lib/time";
import { cn } from "@/lib/utils";
import type { Notification } from "@/lib/db/schema";

/** Top bar: logo (phone), one search box that also asks the assistant, bell dropdown, avatar menu. */
export function TopBar({ overlay = false, className }: { overlay?: boolean; className?: string }) {
  const { user } = useSession();
  const { openAssistant } = useUI();
  const router = useRouter();
  const [q, setQ] = useState("");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const text = q.trim();
    if (!text) return;
    if (/\?$|^(what|any|who|is|are|where|when|find|show|does)\b/i.test(text)) openAssistant(text);
    else router.push(`/connect?q=${encodeURIComponent(text)}`);
    setQ("");
  };

  const box = overlay ? "glass-strong" : "bg-fg/5";
  return (
    <header className={cn("z-30 flex items-center gap-2 sm:gap-3 px-3 sm:px-4 h-14", overlay ? "absolute top-0 left-0 right-0 md:left-[72px]" : "sticky top-0 border-b border-border bg-bg-elev/80 backdrop-blur-xl md:ml-[72px]", className)}>
      <div className={cn("md:hidden", overlay && "glass rounded-2xl px-2 py-1")}><Logo compact /></div>
      <form onSubmit={submit} role="search" className={cn("flex-1 min-w-0 max-w-xl flex items-center gap-2 rounded-xl h-10 px-3 mx-auto", box)}>
        <Search className="size-4 text-fg-faint shrink-0" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search, or ask what's happening…" aria-label="Search or ask" className="flex-1 bg-transparent outline-none text-sm placeholder:text-fg-faint min-w-0" />
        <button type="button" onClick={() => openAssistant(q || undefined)} className="inline-flex items-center gap-1 rounded-lg px-2 h-7 text-xs text-carolina hover:bg-carolina-soft/60" aria-label="Ask a question"><Sparkles className="size-3.5" /><span className="hidden sm:inline">Ask</span></button>
      </form>
      <BellMenu overlay={overlay} />
      <AccountMenu overlay={overlay} userName={user?.displayName} avatar={user?.avatar} />
    </header>
  );
}

function BellMenu({ overlay }: { overlay: boolean }) {
  const { user, unread, refresh } = useSession();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const data = useLive<{ notifications: Notification[] }>(user && open ? "/api/notifications" : null, { interval: 5000, scopes: ["notifications"] });
  const items = (data.data?.notifications ?? []).slice(0, 8);

  const openItem = async (n: Notification) => {
    try { await api.post("/api/notifications/read", { id: n.id }); await refresh(); } catch { /* ignore */ }
    setOpen(false);
    if (n.href) router.push(n.href);
  };
  const markAll = async () => {
    try { await api.post("/api/notifications/read", { all: true }); await refresh(); await data.refresh(); } catch (e) { toast.error((e as Error).message); }
  };

  return (
    <Dropdown open={open} onOpenChange={setOpen}>
      <DropdownTrigger asChild>
        <button type="button" aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`} className={cn("relative grid size-10 place-items-center rounded-xl text-fg-muted hover:text-fg", overlay ? "glass-strong" : "hover:bg-fg/5")}>
          <Bell className="size-4" />
          {unread > 0 && <span className="absolute right-1.5 top-1.5 min-w-4 h-4 px-1 rounded-full bg-red text-white text-[10px] font-bold grid place-items-center">{unread > 9 ? "9+" : unread}</span>}
        </button>
      </DropdownTrigger>
      <DropdownContent className="w-[340px] max-w-[calc(100vw-24px)] p-0 overflow-hidden">
        <div className="flex items-center justify-between px-3 py-2 border-b border-border">
          <span className="text-sm font-semibold">Notifications</span>
          {unread > 0 && <button type="button" onClick={markAll} className="text-xs text-carolina inline-flex items-center gap-1 hover:underline"><CheckCheck className="size-3.5" /> Mark all read</button>}
        </div>
        <div className="max-h-[360px] overflow-y-auto scrollbar-thin">
          {!user ? <p className="px-3 py-6 text-sm text-fg-muted text-center">Post or accept a match and updates show up here.</p>
            : items.length === 0 ? <p className="px-3 py-6 text-sm text-fg-muted text-center">{data.loading ? "Loading…" : "You're all caught up."}</p>
            : items.map((n) => (
              <button key={n.id} type="button" onClick={() => void openItem(n)} className={cn("w-full text-left px-3 py-2.5 border-b border-border last:border-0 hover:bg-fg/5", !n.readAt && "bg-carolina-soft/30")}>
                <div className="flex items-start gap-2">
                  {!n.readAt && <span className="mt-1.5 size-2 rounded-full bg-carolina shrink-0" aria-hidden />}
                  <div className="min-w-0">
                    <div className="text-sm font-medium leading-snug">{n.title}</div>
                    <div className="text-xs text-fg-muted line-clamp-2">{n.body}</div>
                    <div className="text-[11px] text-fg-faint mt-0.5">{timeAgo(n.createdAt)}</div>
                  </div>
                </div>
              </button>
            ))}
        </div>
      </DropdownContent>
    </Dropdown>
  );
}

function AccountMenu({ overlay, userName, avatar }: { overlay: boolean; userName?: string; avatar?: string }) {
  const { user, demoMode, switchDemoUser } = useSession();
  const { theme, setTheme } = useUI();
  const demo = useLive<{ users: { id: string; displayName: string; avatar: string }[] }>(demoMode ? "/api/demo" : null, { interval: 60_000 });
  return (
    <Dropdown>
      <DropdownTrigger asChild>
        <button type="button" aria-label="Account menu" className={cn("grid size-10 place-items-center rounded-xl", overlay ? "glass-strong" : "hover:bg-fg/5")}>
          <Avatar emoji={avatar} name={userName} size={30} />
        </button>
      </DropdownTrigger>
      <DropdownContent>
        <DropdownLabel>{user ? user.displayName : "Browsing as a guest"}</DropdownLabel>
        <DropdownItem asChild><Link href="/profile"><UserRound className="size-4" /> Name, avatar & interests</Link></DropdownItem>
        <DropdownItem onSelect={() => setTheme(theme === "dark" ? "light" : "dark")}>{theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />} {theme === "dark" ? "Light theme" : "Dark theme"}</DropdownItem>
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
            <DropdownItem asChild><Link href="/developer"><Wrench className="size-4" /> Demo remote</Link></DropdownItem>
          </>
        )}
      </DropdownContent>
    </Dropdown>
  );
}
