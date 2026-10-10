"use client";
// Live data hook: fetch now, refetch on a timer (default 3s), and refetch immediately when the SSE channel
// reports a change. Multi-user sync never depends on the browser alone — the server is the source of truth.

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/client";
import type { Scope } from "@/lib/realtime";

type Listener = (scope: Scope) => void;
const listeners = new Set<Listener>();
let es: EventSource | null = null;
let lastRev = 0;

function ensureStream() {
  if (typeof window === "undefined" || es) return;
  es = new EventSource("/api/events");
  es.addEventListener("change", (e) => {
    try {
      const ev = JSON.parse((e as MessageEvent).data) as { scope: Scope; rev: number };
      lastRev = ev.rev;
      for (const l of listeners) l(ev.scope);
    } catch { /* ignore */ }
  });
  es.onerror = () => { /* browser auto-reconnects; polling covers the gap */ };
}

export function onChange(l: Listener) {
  ensureStream();
  listeners.add(l);
  return () => { listeners.delete(l); };
}

export const currentRevision = () => lastRev;

export type LiveState<T> = { data: T | null; error: string | null; loading: boolean; refresh: () => Promise<void>; setData: (fn: (prev: T | null) => T | null) => void };

export function useLive<T>(url: string | null, opts: { interval?: number; scopes?: Scope[]; enabled?: boolean } = {}): LiveState<T> {
  const { interval = 3000, scopes, enabled = true } = opts;
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(!!url);
  const inflight = useRef<Promise<void> | null>(null);
  const urlRef = useRef(url);
  urlRef.current = url;

  const refresh = useCallback(async () => {
    const u = urlRef.current;
    if (!u || !enabled) return;
    if (inflight.current) return inflight.current;
    inflight.current = api.get<T>(u)
      .then((d) => { setData(d); setError(null); })
      .catch((e: Error) => setError(e.message))
      .finally(() => { setLoading(false); inflight.current = null; });
    return inflight.current;
  }, [enabled]);

  useEffect(() => {
    if (!url || !enabled) { setLoading(false); return; }
    setLoading(true);
    void refresh();
    const t = setInterval(() => { if (document.visibilityState === "visible") void refresh(); }, interval);
    const off = onChange((scope) => { if (!scopes || scopes.includes(scope)) void refresh(); });
    const onVis = () => { if (document.visibilityState === "visible") void refresh(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { clearInterval(t); off(); document.removeEventListener("visibilitychange", onVis); };
  }, [url, interval, enabled, refresh, scopes?.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  return { data, error, loading, refresh, setData: (fn) => setData((p) => fn(p)) };
}
