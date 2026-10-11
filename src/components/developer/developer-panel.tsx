"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Bus, Database, MapPin, Radio, RefreshCw, RotateCcw, Wrench, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, Card, Chip, EmptyState, Skeleton } from "@/components/ui/primitives";
import { useSession, useUI } from "@/components/shell/providers";
import { useLive } from "@/hooks/useLive";
import { api } from "@/lib/client";
import { timeAgo } from "@/lib/time";
import type { IntegrationStatus } from "@/lib/services/integrations";

type Source = { id: string; name: string; url: string; homepage: string; adapter: string; kind: string; enabled: boolean; lastFetchedAt: string | null; lastError: string | null; lastCount: number };
type Demo = { demoMode: boolean; users: { id: string; displayName: string; avatar: string }[]; steps: Partial<Record<"aadeeRequest" | "jordanOffer", { user: string; text: string }>>; currentUserId: string | null };

const STATE: Record<IntegrationStatus["state"], { label: string; tone: "mint" | "carolina" | "neutral" | "red" }> = {
  connected: { label: "Connected", tone: "mint" }, fallback: { label: "Fallback", tone: "carolina" }, not_configured: { label: "Not configured", tone: "neutral" }, error: { label: "Error", tone: "red" },
};

export function DeveloperPanel() {
  const { demoMode, loading } = useSession();
  if (loading) return <Skeleton className="h-40 rounded-2xl" />;
  if (!demoMode) return <EmptyState icon={Wrench} title="Developer tools are off" body="Set DEMO_MODE=true to unlock scenario controls and integration tools." />;
  return (
    <div className="grid gap-4 xl:grid-cols-2 [&>*]:min-w-0">
      <Integrations />
      <DemoControls />
      <Sources />
    </div>
  );
}

function SectionTitle({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return <div className="flex items-center justify-between gap-2 flex-wrap"><h2 className="font-semibold">{children}</h2>{right}</div>;
}

function Integrations() {
  const live = useLive<{ integrations: IntegrationStatus[] }>("/api/integrations", { interval: 15000, scopes: ["sources"] });
  const budget = useLive<{ remaining: number | null; limit: number | null; reserve: number; mode: string }>("/api/station/budget", { interval: 60000 });
  const [probing, setProbing] = useState(false);
  const [transitBusy, setTransitBusy] = useState(false);
  const probe = async () => {
    setProbing(true);
    try { const r = await api.post<{ integrations: IntegrationStatus[] }>("/api/integrations/probe"); live.setData(() => r); toast.success("Probe complete"); } catch (e) { toast.error((e as Error).message); } finally { setProbing(false); }
  };
  const transit = async () => {
    setTransitBusy(true);
    try {
      const r = await api.post<{ mode: string; routeCount: number; stopCount: number; feedVersion?: string }>("/api/transit/refresh");
      toast.success(r.mode === "gtfs" ? `GTFS loaded: ${r.routeCount} routes, ${r.stopCount} stops${r.feedVersion ? ` (${r.feedVersion})` : ""}` : "GTFS download failed — offline schedule active");
    } catch (e) { toast.error((e as Error).message); } finally { setTransitBusy(false); }
  };
  return (
    <Card className="space-y-3">
      <SectionTitle right={<div className="flex gap-2"><Button size="sm" variant="secondary" loading={transitBusy} onClick={transit}><Bus /> Re-download GTFS</Button><Button size="sm" loading={probing} onClick={probe}><Zap /> Run live probe</Button></div>}>Integration status</SectionTitle>
      {!live.data ? <Skeleton className="h-24" /> : (
        <div className="grid gap-2 sm:grid-cols-2">
          {live.data.integrations.map((s) => (
            <div key={s.id} className="rounded-xl border border-border p-3 space-y-1">
              <div className="flex items-center justify-between gap-2"><span className="font-medium text-sm">{s.name}</span><Badge tone={STATE[s.state].tone}>{STATE[s.state].label}</Badge></div>
              <p className="text-xs text-fg-muted break-words">{s.detail}</p>
              <p className="text-[11px] text-fg-faint">{s.checkedAt ? `Checked ${timeAgo(s.checkedAt)}` : "Not probed yet"}</p>
            </div>
          ))}
        </div>
      )}
      <p className="text-xs text-fg-muted border-t border-border pt-2.5">
        {budget.data?.remaining != null
          ? <>Voice budget: <span className="font-semibold text-fg">{budget.data.remaining.toLocaleString()}{budget.data.limit ? ` of ${budget.data.limit.toLocaleString()}` : ""} characters left</span> · reserve {budget.data.reserve.toLocaleString()} · mode {budget.data.mode}</>
          : "Voice budget: unavailable without an ElevenLabs key"}
      </p>
    </Card>
  );
}

function Sources() {
  const live = useLive<{ sources: Source[] }>("/api/sources", { interval: 15000, scopes: ["sources"] });
  const [busy, setBusy] = useState(false);
  const refresh = async () => {
    setBusy(true);
    try {
      const r = await api.post<{ results: { id: string; ok: boolean; count: number; error?: string }[]; sources: Source[] }>("/api/sources/refresh");
      live.setData(() => ({ sources: r.sources }));
      const ok = r.results.filter((x) => x.ok);
      toast[ok.length === r.results.length ? "success" : "warning"](`${ok.length}/${r.results.length} sources refreshed`, { description: r.results.map((x) => `${x.id}: ${x.ok ? `${x.count} items` : x.error}`).join(" · ") });
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <Card className="space-y-3 xl:col-span-2">
      <SectionTitle right={<Button size="sm" variant="secondary" loading={busy} onClick={refresh}><RefreshCw /> Refresh all sources</Button>}>Campus sources</SectionTitle>
      {!live.data ? <Skeleton className="h-24" /> : (
        <div className="overflow-x-auto scrollbar-thin -mx-4 px-4">
          <table className="w-full text-sm min-w-[640px]">
            <thead className="text-left text-[11px] uppercase tracking-wide text-fg-faint"><tr><th className="py-1.5 pr-3 font-semibold">Source</th><th className="py-1.5 pr-3 font-semibold">Adapter</th><th className="py-1.5 pr-3 font-semibold">Kind</th><th className="py-1.5 pr-3 font-semibold">Last fetched</th><th className="py-1.5 pr-3 font-semibold text-right">Count</th><th className="py-1.5 font-semibold">Last error</th></tr></thead>
            <tbody className="divide-y divide-border">
              {live.data.sources.map((s) => (
                <tr key={s.id}>
                  <td className="py-2 pr-3"><a href={s.homepage} target="_blank" rel="noreferrer" className="font-medium text-carolina hover:underline">{s.name}</a>{!s.enabled && <Badge className="ml-1.5">disabled</Badge>}</td>
                  <td className="py-2 pr-3 text-fg-muted">{s.adapter}</td>
                  <td className="py-2 pr-3 text-fg-muted capitalize">{s.kind}</td>
                  <td className="py-2 pr-3 text-fg-muted">{s.lastFetchedAt ? timeAgo(new Date(s.lastFetchedAt)) : "never"}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{s.lastCount}</td>
                  <td className="py-2 text-xs text-red break-words max-w-[280px]">{s.lastError ?? <span className="text-fg-faint">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function DemoControls() {
  const router = useRouter();
  const { focusMap } = useUI();
  const { user, switchDemoUser, refresh } = useSession();
  const demo = useLive<Demo>("/api/demo", { interval: 30000 });
  const [busy, setBusy] = useState<string | null>(null);

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    try { await fn(); } catch (e) { toast.error((e as Error).message); } finally { setBusy(null); }
  };
  const actions: { key: string; label: string; icon: React.ComponentType<{ className?: string }>; variant?: "primary" | "secondary" | "danger" | "mint"; fn: () => Promise<void> }[] = [
    { key: "reset", label: "Reset scenario data", icon: RotateCcw, variant: "danger", fn: async () => { if (!confirm("Wipe seeded posts, matches and messages, then reseed?")) return; await api.post("/api/demo/reset"); await refresh(); toast.success("Scenario reset"); } },
    { key: "seed", label: "Load example activity", icon: Database, variant: "secondary", fn: async () => { await api.post("/api/demo/seed"); toast.success("Example activity loaded"); } },
    { key: "aadee", label: "Inject Aadee's charger request", icon: Zap, fn: async () => { await api.post("/api/demo/inject", { step: "aadeeRequest" }); toast.success("Posted as Aadee"); } },
    { key: "jordan", label: "Inject Jordan's charger offer", icon: Zap, fn: async () => {
      const r = await api.post<{ matches: { id: string }[] }>("/api/demo/inject", { step: "jordanOffer" });
      const m = r.matches[0];
      toast.success(`Posted as Jordan — ${r.matches.length} match${r.matches.length === 1 ? "" : "es"} found`, m ? { action: { label: "Open match", onClick: () => router.push(`/connect?match=${m.id}`) } } : undefined);
    } },
    { key: "radio", label: "Generate radio briefing", icon: Radio, variant: "mint", fn: async () => { await api.post("/api/briefings", { format: "radio", length: "medium", interests: [] }); router.push("/radio"); } },
    { key: "map", label: "Open Davis Library on map", icon: MapPin, variant: "secondary", fn: async () => { focusMap({ lat: 35.9108, lng: -79.0481, label: "Davis Library" }); router.push("/map"); } },
  ];

  return (
    <Card className="space-y-4">
      <SectionTitle>Scenario controls</SectionTitle>
      <div>
        <div className="text-xs font-semibold uppercase tracking-wide text-fg-faint mb-1.5">Active profile</div>
        <div className="flex flex-wrap gap-1.5">
          {(demo.data?.users ?? []).map((u) => <Chip key={u.id} active={user?.id === u.id} onClick={() => switchDemoUser(u.id)}>{u.avatar} {u.displayName}</Chip>)}
          <Chip onClick={() => switchDemoUser(null)}>Sign out</Chip>
        </div>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {actions.map((a) => <Button key={a.key} variant={a.variant ?? "primary"} className="justify-start" loading={busy === a.key} disabled={!!busy && busy !== a.key} onClick={() => run(a.key, a.fn)}><a.icon /> {a.label}</Button>)}
      </div>
      {demo.data?.steps && (
        <div className="space-y-2">
          <div className="text-xs font-semibold uppercase tracking-wide text-fg-faint">Read-aloud script</div>
          {(["aadeeRequest", "jordanOffer"] as const).map((k) => demo.data?.steps[k] && (
            <blockquote key={k} className="rounded-xl bg-fg/5 px-3 py-2 text-sm"><span className="font-semibold mr-1.5">{k === "aadeeRequest" ? "Aadee:" : "Jordan:"}</span>“{demo.data.steps[k]!.text}”</blockquote>
          ))}
        </div>
      )}
      <p className="text-xs text-fg-muted">Matches land in <Link href="/connect" className="text-carolina hover:underline">Connect</Link>; accept as both profiles to open a conversation.</p>
    </Card>
  );
}


