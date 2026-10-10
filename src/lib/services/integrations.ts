import { env, hasElevenLabs, hasGemini, hasPhoton } from "@/lib/env";
import { probeGemini } from "@/lib/ai/gemini";
import { probeElevenLabs } from "@/lib/voice/elevenlabs";
import { listSources } from "./sources";
import { loadTransit } from "./transit";

export type IntegrationStatus = { id: string; name: string; state: "connected" | "fallback" | "not_configured" | "error"; detail: string; checkedAt: number | null };

/** Status without network calls (safe for page loads). */
export function integrationStatusQuick(): IntegrationStatus[] {
  const sources = listSources();
  const ok = sources.filter((s) => s.lastFetchedAt && !s.lastError).length;
  const lastChecked = Math.max(0, ...sources.map((s) => s.lastFetchedAt?.getTime() ?? 0)) || null;
  return [
    { id: "gemini", name: "Gemini", state: hasGemini() ? "connected" : "fallback", detail: hasGemini() ? `Key present (${env.gemini.model}) — run a probe to validate` : "Not configured — deterministic local parser & templates", checkedAt: null },
    { id: "elevenlabs", name: "ElevenLabs", state: hasElevenLabs() ? "connected" : "fallback", detail: hasElevenLabs() ? "Key present — run a probe to validate" : "Not configured — browser speech synthesis", checkedAt: null },
    { id: "photon", name: "Photon (iMessage)", state: hasPhoton() ? "connected" : "not_configured", detail: hasPhoton() ? "Credentials present — start `npm run worker:photon`" : "Photon not connected — set SPECTRUM_PROJECT_ID / SPECTRUM_PROJECT_SECRET", checkedAt: null },
    { id: "sources", name: "Campus sources", state: ok === sources.length && ok > 0 ? "connected" : ok > 0 ? "error" : "not_configured", detail: `${ok}/${sources.length} feeds healthy`, checkedAt: lastChecked },
    { id: "transit", name: "Transit", state: "fallback", detail: "Not loaded yet", checkedAt: null },
  ];
}

/** Full status with live probes (developer page button). */
export async function integrationStatusProbe(): Promise<IntegrationStatus[]> {
  const quick = integrationStatusQuick();
  const now = Date.now();
  const [g, e, t] = await Promise.all([probeGemini(), probeElevenLabs(), loadTransit()]);
  return quick.map((s) => {
    if (s.id === "gemini") return { ...s, state: !hasGemini() ? "fallback" : g.ok ? "connected" : "error", detail: g.detail, checkedAt: now };
    if (s.id === "elevenlabs") return { ...s, state: !hasElevenLabs() ? "fallback" : e.ok ? "connected" : "error", detail: e.detail, checkedAt: now };
    if (s.id === "transit") return { ...s, state: t.mode === "gtfs" ? "connected" : "fallback", detail: t.mode === "gtfs" ? `Scheduled data: ${t.routes.length} routes, ${t.stops.length} stops (${t.feedVersion}). Real-time positions: not available (official tracker linked).` : "Demo overlay only — GTFS download failed", checkedAt: now };
    return s;
  });
}
