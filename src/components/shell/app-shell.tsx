"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { TooltipProvider } from "@/components/ui/primitives";
import { NavRail, BottomNav, Fab } from "./nav";
import { TopBar } from "./topbar";
import { CreatePostDialog } from "@/components/posts/create-post-dialog";
import { AssistantDock } from "@/components/assistant/assistant-dock";
import { cn } from "@/lib/utils";
import { PageBubbles } from "./bubbles";

/** Layout chrome. The home page renders the top bar as an overlay on the map; other pages get a sticky bar. */
export function AppShell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const isMap = path === "/";
  return (
    <TooltipProvider>
      <div className="min-h-dvh aero-bg">
        <NavRail />
        {!isMap && <PageBubbles />}
        {!isMap && <TopBar />}
        <main className={cn("md:ml-[72px] relative z-10", isMap ? "h-dvh" : "pb-24 md:pb-10")}>{children}</main>
        <BottomNav />
        <Fab />
        <CreatePostDialog />
        <AssistantDock />
      </div>
    </TooltipProvider>
  );
}

/** Standard page container for non-map pages. */
export function Page({ title, subtitle, actions, children, wide }: { title: string; subtitle?: string; actions?: ReactNode; children: ReactNode; wide?: boolean }) {
  return (
    <div className={cn("relative mx-auto px-4 sm:px-6 py-6", wide ? "max-w-[1400px]" : "max-w-6xl")}>
      <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
        <div>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">{title}</h1>
          {subtitle && <p className="text-sm text-fg-muted mt-1 max-w-2xl">{subtitle}</p>}
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
      {children}
    </div>
  );
}
