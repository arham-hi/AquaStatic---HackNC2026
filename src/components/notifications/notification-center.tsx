"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Bell, BellRing, CalendarDays, CheckCheck, CheckCircle2, HeartHandshake, Hourglass, MessageSquare, Newspaper, Sparkles, XCircle, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, EmptyState, Skeleton, Switch, Tabs, TabsList, TabsTrigger } from "@/components/ui/primitives";
import { useSession } from "@/components/shell/providers";
import { useLive } from "@/hooks/useLive";
import { api } from "@/lib/client";
import { timeAgo } from "@/lib/time";
import { cn } from "@/lib/utils";
import type { Notification, NotificationType } from "@/lib/db/schema";

type Row = Omit<Notification, "createdAt" | "readAt"> & { createdAt: string; readAt: string | null };

const ICONS: Record<NotificationType, LucideIcon> = {
  match_suggested: HeartHandshake, match_accepted: Sparkles, new_message: MessageSquare, request_fulfilled: CheckCircle2,
  post_expiring: Hourglass, relevant_event: CalendarDays, source_update: Newspaper, match_declined: XCircle,
};

const NOTIFIED_KEY = "aqua-notified";
function notifiedSet(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(NOTIFIED_KEY) ?? "[]") as string[]); } catch { return new Set(); }
}

export function NotificationCenter() {
  const router = useRouter();
  const { user, loading: sessionLoading, refresh: refreshSession } = useSession();
  const live = useLive<{ notifications: Row[]; unread: number }>(user ? "/api/notifications" : null, { scopes: ["notifications"] });
  const [tab, setTab] = useState<"all" | "unread">("all");
  const [browserOn, setBrowserOn] = useState(false);
  const [denied, setDenied] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const perm = typeof Notification !== "undefined" ? Notification.permission : "default";
    setDenied(perm === "denied");
    setBrowserOn(!!user?.notificationPrefs?.browser && perm === "granted");
  }, [user?.notificationPrefs?.browser]);

  // Fire a browser notification once per new unread id (only when the user opted in).
  const rows = useMemo(() => live.data?.notifications ?? [], [live.data]);
  useEffect(() => {
    if (!browserOn || typeof Notification === "undefined" || Notification.permission !== "granted") return;
    const seen = notifiedSet();
    let changed = false;
    for (const n of rows) {
      if (n.readAt || seen.has(n.id)) continue;
      seen.add(n.id); changed = true;
      try { new Notification(n.title, { body: n.body, tag: n.id }); } catch { /* ignore */ }
    }
    if (changed) { try { localStorage.setItem(NOTIFIED_KEY, JSON.stringify(Array.from(seen).slice(-200))); } catch { /* ignore */ } }
  }, [rows, browserOn]);

  const markRead = async (body: { id: string } | { all: true }) => {
    try {
      const r = await api.post<{ unread: number }>("/api/notifications/read", body);
      live.setData((p) => (p ? { unread: r.unread, notifications: p.notifications.map((n) => ("all" in body || n.id === body.id) && !n.readAt ? { ...n, readAt: new Date().toISOString() } : n) } : p));
      void refreshSession();
    } catch (e) { toast.error((e as Error).message); }
  };

  const open = async (n: Row) => {
    if (!n.readAt) await markRead({ id: n.id });
    if (n.href) router.push(n.href);
  };

  const toggleBrowser = async (on: boolean) => {
    if (typeof Notification === "undefined") return toast.error("This browser does not support notifications");
    setBusy(true);
    try {
      if (on) {
        const perm = await Notification.requestPermission();
        if (perm !== "granted") { toast.message("Permission not granted"); return; }
      }
      await api.patch("/api/me", { notificationPrefs: { ...(user?.notificationPrefs ?? {}), browser: on } });
      setBrowserOn(on);
      await refreshSession();
      toast.success(on ? "Browser notifications on" : "Browser notifications off");
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };

  const visible = tab === "unread" ? rows.filter((n) => !n.readAt) : rows;
  const unread = live.data?.unread ?? 0;

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <Tabs value={tab} onValueChange={(v) => setTab(v as "all" | "unread")}>
            <TabsList><TabsTrigger value="all">All</TabsTrigger><TabsTrigger value="unread">Unread{unread > 0 && <span className="rounded-full bg-carolina text-white text-[10px] px-1.5 leading-4">{unread}</span>}</TabsTrigger></TabsList>
          </Tabs>
          <Button variant="secondary" size="sm" disabled={unread === 0} onClick={() => markRead({ all: true })}><CheckCheck /> Mark all read</Button>
        </div>

        {sessionLoading || (user && live.loading && !live.data) ? (
          <div className="space-y-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-16 rounded-2xl" />)}</div>
        ) : visible.length === 0 ? (
          <EmptyState icon={Bell} title={tab === "unread" ? "You're all caught up" : "No notifications yet"} body="We will let you know about match suggestions, replies, and events near your usual spots." />
        ) : (
          <ul className="space-y-1.5">
            {visible.map((n) => {
              const Icon = ICONS[n.type] ?? Bell;
              const isUnread = !n.readAt;
              return (
                <li key={n.id}>
                  <button type="button" onClick={() => open(n)} className={cn("w-full text-left card p-3.5 flex items-start gap-3 transition-colors hover:border-border-strong focus-visible:ring-4 focus-visible:ring-carolina/20 focus-visible:outline-none", isUnread && "bg-carolina-soft/30 border-carolina/30")}>
                    <span className={cn("size-9 shrink-0 rounded-xl grid place-items-center", isUnread ? "bg-carolina text-white" : "bg-fg/5 text-fg-muted")}><Icon className="size-4" /></span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        {isUnread && <span className="size-2 rounded-full bg-carolina shrink-0" aria-label="Unread" />}
                        <span className={cn("truncate text-sm", isUnread ? "font-semibold" : "font-medium")}>{n.title}</span>
                        <span className="ml-auto shrink-0 text-[11px] text-fg-faint">{timeAgo(new Date(n.createdAt))}</span>
                      </span>
                      <span className="block text-sm text-fg-muted line-clamp-2">{n.body}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <aside>
        <Card className="space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2"><BellRing className="size-4 text-carolina" /><span className="font-semibold text-sm">Browser notifications</span></div>
            <Switch checked={browserOn} disabled={busy || !user} onCheckedChange={(v) => void toggleBrowser(v)} aria-label="Toggle browser notifications" />
          </div>
          <p className="text-sm text-fg-muted">Get a desktop alert when a match or message arrives while this tab is open. We only ask for permission when you flip this on.</p>
          {denied && <p className="text-xs text-red">Notifications are blocked in your browser settings for this site.</p>}
        </Card>
      </aside>
    </div>
  );
}
