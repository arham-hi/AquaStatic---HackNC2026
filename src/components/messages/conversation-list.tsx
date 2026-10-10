"use client";

import Link from "next/link";
import { MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, Card, EmptyState, Skeleton } from "@/components/ui/primitives";
import { useSession } from "@/components/shell/providers";
import { useLive } from "@/hooks/useLive";
import { timeAgo } from "@/lib/time";
import { cn } from "@/lib/utils";
import type { ConversationView } from "@/lib/services/connections";

type Row = Omit<ConversationView, "createdAt" | "updatedAt" | "lastMessage"> & { lastMessage: { content: string; senderId: string; createdAt: string } | null };

export function ConversationList() {
  const { user, loading: sessionLoading } = useSession();
  const live = useLive<{ conversations: Row[] }>(user ? "/api/conversations" : null, { scopes: ["messages", "matches"] });

  if (sessionLoading || (user && live.loading && !live.data)) {
    return (
      <div className="space-y-3">
        {[0, 1, 2].map((i) => (
          <Card key={i} className="flex gap-3"><Skeleton className="size-11 rounded-full" /><div className="flex-1 space-y-2"><Skeleton className="w-1/3" /><Skeleton className="w-2/3" /></div></Card>
        ))}
      </div>
    );
  }
  const rows = live.data?.conversations ?? [];
  if (!user || rows.length === 0) {
    return (
      <EmptyState icon={MessageSquare} title="No conversations yet" body="Accept a match in Connect to start one. Both people have to accept before messaging opens."
        action={<Button asChild><Link href="/connect">Go to Connect</Link></Button>} />
    );
  }
  return (
    <ul className="space-y-2">
      {rows.map((c) => {
        const other = c.participants.find((p) => p.id !== user.id) ?? c.participants[0];
        const mine = c.lastMessage?.senderId === user.id;
        return (
          <li key={c.id}>
            <Link href={`/messages/${c.id}`} className={cn("card flex items-center gap-3 p-3.5 transition-colors hover:border-border-strong focus-visible:ring-4 focus-visible:ring-carolina/20 focus-visible:outline-none", c.unread > 0 && "border-carolina/40")}>
              <Avatar emoji={other?.avatar} name={other?.displayName} size={44} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className={cn("truncate", c.unread > 0 ? "font-semibold" : "font-medium")}>{other?.displayName ?? "Unknown"}</span>
                  {c.lastMessage && <span className="ml-auto shrink-0 text-[11px] text-fg-faint">{timeAgo(new Date(c.lastMessage.createdAt))}</span>}
                </div>
                {c.context && <div className="truncate text-xs text-fg-muted">{c.context.requestTitle} ↔ {c.context.offerTitle}</div>}
                <div className={cn("truncate text-sm", c.unread > 0 ? "text-fg" : "text-fg-muted")}>{c.lastMessage ? `${mine ? "You: " : ""}${c.lastMessage.content}` : "Say hello"}</div>
              </div>
              {c.unread > 0 && <span className="min-w-5 h-5 px-1.5 rounded-full bg-carolina text-white text-[11px] font-bold grid place-items-center" aria-label={`${c.unread} unread`}>{c.unread > 9 ? "9+" : c.unread}</span>}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
