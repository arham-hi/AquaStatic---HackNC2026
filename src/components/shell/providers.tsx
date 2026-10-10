"use client";
// Session (who am I), UI actions (open create / assistant), theme, and toasts.

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { Toaster, toast } from "sonner";
import { api } from "@/lib/client";
import { useLive } from "@/hooks/useLive";
import type { User } from "@/lib/db/schema";

type PublicUser = Pick<User, "id" | "displayName" | "avatar" | "isDemo" | "interests" | "helpSubjects" | "preferredArea" | "notificationPrefs">;

type Session = {
  user: PublicUser | null;
  unread: number;
  demoMode: boolean;
  loading: boolean;
  refresh: () => Promise<void>;
  ensureUser: () => Promise<PublicUser>;
  switchDemoUser: (id: string | null) => Promise<void>;
};

const SessionCtx = createContext<Session | null>(null);

type UI = {
  openCreate: (prefill?: string) => void;
  openAssistant: (question?: string) => void;
  createState: { open: boolean; prefill?: string };
  assistantState: { open: boolean; question?: string };
  setCreateOpen: (v: boolean) => void;
  setAssistantOpen: (v: boolean) => void;
  theme: "light" | "dark";
  setTheme: (t: "light" | "dark") => void;
  focusMap: (target: { lat: number; lng: number; label?: string; itemId?: string } | null) => void;
  mapFocus: { lat: number; lng: number; label?: string; itemId?: string; nonce: number } | null;
};
const UICtx = createContext<UI | null>(null);

export function Providers({ children, initialTheme }: { children: ReactNode; initialTheme: "light" | "dark" }) {
  const me = useLive<{ user: PublicUser | null; unread: number; demoMode: boolean }>("/api/me", { interval: 4000, scopes: ["notifications", "matches", "messages"] });
  const [theme, setThemeState] = useState<"light" | "dark">(initialTheme);
  const [createState, setCreateState] = useState<{ open: boolean; prefill?: string }>({ open: false });
  const [assistantState, setAssistantState] = useState<{ open: boolean; question?: string }>({ open: false });
  const [mapFocus, setMapFocus] = useState<UI["mapFocus"]>(null);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem("aqua-theme", theme); document.cookie = `aqua-theme=${theme}; path=/; max-age=31536000; samesite=lax`; } catch { /* ignore */ }
  }, [theme]);

  const ensureUser = useCallback(async () => {
    if (me.data?.user) return me.data.user;
    const r = await api.post<{ user: PublicUser }>("/api/me/guest");
    await me.refresh();
    return r.user;
  }, [me]);

  const switchDemoUser = useCallback(async (id: string | null) => {
    await api.post("/api/demo/switch", { userId: id });
    await me.refresh();
    toast.success(id ? "Switched demo profile" : "Signed out of demo profile");
  }, [me]);

  const session = useMemo<Session>(() => ({
    user: me.data?.user ?? null, unread: me.data?.unread ?? 0, demoMode: me.data?.demoMode ?? false, loading: me.loading, refresh: me.refresh, ensureUser, switchDemoUser,
  }), [me.data, me.loading, me.refresh, ensureUser, switchDemoUser]);

  const ui = useMemo<UI>(() => ({
    openCreate: (prefill) => setCreateState({ open: true, prefill }),
    openAssistant: (question) => setAssistantState({ open: true, question }),
    createState, assistantState,
    setCreateOpen: (open) => setCreateState((s) => ({ ...s, open, prefill: open ? s.prefill : undefined })),
    setAssistantOpen: (open) => setAssistantState((s) => ({ ...s, open })),
    theme, setTheme: setThemeState,
    focusMap: (t) => setMapFocus(t ? { ...t, nonce: Date.now() } : null),
    mapFocus,
  }), [createState, assistantState, theme, mapFocus]);

  return (
    <SessionCtx.Provider value={session}>
      <UICtx.Provider value={ui}>
        {children}
        <Toaster position="top-center" theme={theme} richColors closeButton toastOptions={{ className: "!rounded-2xl !border !border-border !shadow-lg", duration: 4500 }} />
      </UICtx.Provider>
    </SessionCtx.Provider>
  );
}

export function useSession() {
  const c = useContext(SessionCtx);
  if (!c) throw new Error("useSession outside Providers");
  return c;
}
export function useUI() {
  const c = useContext(UICtx);
  if (!c) throw new Error("useUI outside Providers");
  return c;
}
