// In-process change bus. Services call `bump(scope)`; the SSE route fans it out; clients refetch.
// Polling every ~3s remains the fallback, so a missed event never breaks sync.
// ponytail: single-process only. If you ever run multiple Node instances, swap this for a DB "changes" table.

export type Scope = "posts" | "matches" | "messages" | "notifications" | "sources" | "briefings";
type Listener = (ev: { scope: Scope; rev: number; at: number }) => void;

const g = globalThis as unknown as { __aquaRt?: { rev: number; listeners: Set<Listener> } };
const state = (g.__aquaRt ??= { rev: 0, listeners: new Set() });

export function bump(scope: Scope) {
  state.rev += 1;
  const ev = { scope, rev: state.rev, at: Date.now() };
  for (const l of state.listeners) {
    try { l(ev); } catch { /* listener gone */ }
  }
}

export const revision = () => state.rev;

export function subscribe(l: Listener) {
  state.listeners.add(l);
  return () => { state.listeners.delete(l); };
}
